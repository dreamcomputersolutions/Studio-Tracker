import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla, Sri Lanka",
  phone: "077 731 1230",
  logo: "/LOGO.png" // UPDATED LOGO
};

export default function AdminDashboard() {
  const [allJobs, setAllJobs] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, income: 0 });

  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAllJobs(jobsData);

      // Stats Logic
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

  const handleFinalize = async (job, sizes, cost) => {
    if(!confirm("Are you sure you want to complete this job?")) return;

    // 1. Update Database
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes,
      totalCost: cost,
      status: "Completed",
      finalizedDate: new Date().toDateString()
    });

    // 2. Generate PDF Data
    const pdfBase64 = generatePDFBase64(job, sizes, cost);

    // 3. Send Email with Attachment
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          name: job.name, 
          email: job.email, 
          jobId: job.id, 
          pdfBase64: pdfBase64 // Sending the file content
        })
      });
      alert("Job Completed & Receipt Emailed!");
    } catch (err) {
      console.error(err);
      alert("Job saved, but Email failed.");
    }
  };

  return (
    <div className="container dashboard-container">
      <div className="brand-header center">
        <img src={COMPANY.logo} alt="Logo" className="logo" />
        <div className="brand-info">
          <h1>Studio Click Dashboard</h1>
          <p>{COMPANY.address}</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><h3>Total Jobs</h3><p>{stats.total}</p></div>
        <div className="stat-card"><h3>Today's Jobs</h3><p>{stats.today}</p></div>
        <div className="stat-card highlight"><h3>Today's Income</h3><p>LKR {stats.income}</p></div>
      </div>

      <h2>Job List ({allJobs.length})</h2>
      <div className="job-list">
        {allJobs.map(job => (
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

  // Manual Print Handler
  const handlePrint = () => {
    const doc = createPDFDoc(job, sizes, cost);
    doc.autoPrint(); // Open print dialog
    window.open(doc.output('bloburl'), '_blank');
  };

  return (
    <div className={`job-card ${isCompleted ? 'card-completed' : 'card-pending'}`}>
      <div className="job-header">
        <div>
          <h3>{job.name} <span style={{fontSize:'0.8em', color:'#666'}}>({job.id})</span></h3>
          <span className="job-phone">{job.phone}</span>
        </div>
        <span className={`status-badge ${isCompleted ? 'badge-green' : 'badge-orange'}`}>
          {job.status}
        </span>
      </div>
      <p className="job-email">{job.email}</p>

      <div className="job-inputs">
        {isCompleted ? (
          <>
            <div className="read-only-field"><label>Sizes</label><strong>{job.sizes}</strong></div>
            <div className="read-only-field"><label>Cost</label><strong>LKR {job.totalCost}</strong></div>
          </>
        ) : (
          <>
            <input placeholder="Sizes" value={sizes} onChange={e => setSizes(e.target.value)} />
            <input placeholder="Cost" type="number" value={cost} onChange={e => setCost(e.target.value)} />
          </>
        )}
      </div>

      <div style={{display:'flex', gap:'10px'}}>
        {!isCompleted && (
          <button onClick={() => onSave(job, sizes, cost)}>Complete & Email</button>
        )}
        {/* PRINT BUTTON - Available for everyone, but mostly for completed jobs */}
        <button onClick={handlePrint} style={{backgroundColor: '#6b7280'}}>
          Print Receipt
        </button>
      </div>
    </div>
  );
}

// --- SHARED PDF GENERATOR LOGIC ---
// We create a helper so both "Print" and "Email" use the exact same design
const createPDFDoc = (job, sizes, cost) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.text(COMPANY.name, 105, 20, null, null, "center");
  doc.setFontSize(10);
  doc.text(COMPANY.address, 105, 30, null, null, "center");
  doc.text(`Tel: ${COMPANY.phone}`, 105, 35, null, null, "center");
  doc.line(20, 40, 190, 40);

  // Receipt Info
  doc.setFontSize(16);
  doc.text("OFFICIAL RECEIPT", 105, 55, null, null, "center");
  doc.setFontSize(12);
  doc.text(`Receipt No: #${job.id}`, 20, 70);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 70);

  // Customer
  doc.setFillColor(245, 245, 245);
  doc.rect(20, 80, 170, 25, "F");
  doc.text(`Customer: ${job.name}`, 25, 90);
  doc.text(`Phone: ${job.phone}`, 25, 98);

  // Details
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

  // Footer
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text("Thank you!", 105, 180, null, null, "center");

  return doc;
};

// Helper to get Base64 string for Email
const generatePDFBase64 = (job, sizes, cost) => {
  const doc = createPDFDoc(job, sizes, cost);
  // btoa converts binary string to base64
  return btoa(doc.output()); 
};