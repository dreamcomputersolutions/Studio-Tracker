import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla, Sri Lanka",
  phone: "077 731 1230",
  logo: "/LOGO.png"
};

export default function AdminDashboard() {
  const [allJobs, setAllJobs] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'pending', 'completed'
  const [stats, setStats] = useState({ total: 0, today: 0, income: 0 });

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAllJobs(jobsData);

      let total = 0, todayCount = 0, income = 0;
      const todayStr = new Date().toDateString();

      jobsData.forEach(job => {
        total++;
        if (job.status === "Completed" && job.finalizedDate === todayStr) {
          todayCount++;
          income += Number(job.totalCost || 0);
        }
      });
      setStats({ total, today: todayCount, income });
    });
    return unsubscribe;
  }, []);

  // --- NEW: Calculate Counts for Buttons ---
  const pendingCount = allJobs.filter(job => job.status === "Pending").length;
  const completedCount = allJobs.filter(job => job.status === "Completed").length;
  const totalCount = allJobs.length;

  const handleFinalize = async (job, sizes, cost) => {
    if(!confirm("Mark this job as completed?")) return;

    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes,
      totalCost: cost,
      status: "Completed",
      finalizedDate: new Date().toDateString()
    });

    const pdfBase64 = generatePDFBase64(job, sizes, cost);

    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          name: job.name, email: job.email, jobId: job.id, pdfBase64
        })
      });
      alert("Job Completed & Receipt Emailed!");
    } catch (err) {
      console.error(err);
      alert("Saved, but Email failed.");
    }
  };

  // Filter Logic
  const filteredJobs = allJobs.filter(job => {
    if (filter === 'all') return true;
    return job.status.toLowerCase() === filter;
  });

  return (
    <div className="container dashboard-container">
      <div className="brand-header">
        <img src={COMPANY.logo} alt="Logo" className="logo" />
        <h1>Studio Click Dashboard</h1>
        <p>{COMPANY.address}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><h3>Total Jobs</h3><p>{stats.total}</p></div>
        <div className="stat-card"><h3>Today's Jobs</h3><p>{stats.today}</p></div>
        <div className="stat-card highlight"><h3>Today's Income</h3><p>LKR {stats.income}</p></div>
      </div>

      {/* --- UPDATED FILTER BAR WITH COUNTS --- */}
      <div className="filter-bar">
        <button 
          className={`filter-btn ${filter==='all' ? 'active':''}`} 
          onClick={()=>setFilter('all')}
        >
          All Jobs ({totalCount})
        </button>
        
        <button 
          className={`filter-btn ${filter==='pending' ? 'active':''}`} 
          onClick={()=>setFilter('pending')}
        >
          Pending ({pendingCount})
        </button>
        
        <button 
          className={`filter-btn ${filter==='completed' ? 'active':''}`} 
          onClick={()=>setFilter('completed')}
        >
          Completed ({completedCount})
        </button>
      </div>

      <div className="job-list">
        {filteredJobs.length === 0 ? <p style={{textAlign:'center', color:'#888'}}>No jobs found in this category.</p> : null}
        
        {filteredJobs.map(job => (
          <JobItem key={job.id} job={job} onSave={handleFinalize} />
        ))}
      </div>
    </div>
  );
}

function JobItem({ job, onSave }) {
  const [sizes, setSizes] = useState(job.sizes || '');
  const [cost, setCost] = useState(job.totalCost || '');
  const isCompleted = job.status === "Completed";

  const handlePrint = () => {
    const doc = createPDFDoc(job, sizes, cost);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  return (
    <div className={`job-row ${isCompleted ? 'row-completed' : 'row-pending'}`}>
      
      {/* INFO */}
      <div className="row-info">
        <div style={{display:'flex', alignItems:'center'}}>
          <span className="job-id">{job.id}</span>
          <span className="customer-name">{job.name}</span>
        </div>
        <span className="customer-phone">{job.phone}</span>
      </div>

      {/* DETAILS */}
      <div className="row-details">
        {isCompleted ? (
          <>
            <span><strong>{job.sizes}</strong></span>
            <span>LKR <strong>{job.totalCost}</strong></span>
          </>
        ) : (
          <>
            <input className="compact-input" placeholder="Sizes (4x6)" value={sizes} onChange={e=>setSizes(e.target.value)} />
            <input className="compact-input" type="number" placeholder="Cost" value={cost} onChange={e=>setCost(e.target.value)} style={{maxWidth:'100px'}} />
          </>
        )}
      </div>

      {/* ACTIONS */}
      <div className="row-actions">
        <span className={`badge ${isCompleted ? 'badge-completed' : 'badge-pending'}`}>
          {isCompleted ? "COMPLETED" : "PENDING"}
        </span>

        {!isCompleted && (
          <button className="btn-save" onClick={() => onSave(job, sizes, cost)}>Save</button>
        )}
        <button className="btn-print" onClick={handlePrint} title="Print">🖨️</button>
      </div>
    </div>
  );
}

// --- PDF HELPERS ---
const createPDFDoc = (job, sizes, cost) => {
  const doc = new jsPDF();
  doc.setFontSize(22);
  doc.text(COMPANY.name, 105, 20, null, null, "center");
  doc.setFontSize(10);
  doc.text(COMPANY.address, 105, 30, null, null, "center");
  doc.text(`Tel: ${COMPANY.phone}`, 105, 35, null, null, "center");
  doc.line(20, 40, 190, 40);

  doc.setFontSize(16);
  doc.text("OFFICIAL RECEIPT", 105, 55, null, null, "center");
  doc.setFontSize(12);
  doc.text(`Receipt No: #${job.id}`, 20, 70);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 70);

  doc.setFillColor(245, 245, 245);
  doc.rect(20, 80, 170, 25, "F");
  doc.text(`Customer: ${job.name}`, 25, 90);
  doc.text(`Phone: ${job.phone}`, 25, 98);

  let y = 125;
  doc.text("Description", 20, y);
  doc.text("Amount", 160, y);
  doc.line(20, y+2, 190, y+2);
  
  y += 15;
  doc.text(`Photo Job (${sizes})`, 20, y);
  doc.text(`LKR ${cost}.00`, 160, y);

  y += 20;
  doc.setFont(undefined, 'bold');
  doc.text("TOTAL:", 120, y);
  doc.text(`LKR ${cost}.00`, 160, y);

  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text("Thank you for choosing Studio Click!", 105, 180, null, null, "center");
  return doc;
};

const generatePDFBase64 = (job, sizes, cost) => {
  const doc = createPDFDoc(job, sizes, cost);
  return btoa(doc.output()); 
};