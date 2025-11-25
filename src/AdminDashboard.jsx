import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla, Sri Lanka",
  phone: "077 731 1230",
  logo: "/LOGO.png" // Assumes LOGO.png is in the public folder
};

export default function AdminDashboard() {
  const [allJobs, setAllJobs] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, income: 0 });

  // 1. Fetch Data & Calculate Stats
  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAllJobs(jobsData);

      // Real-time Statistics Calculation
      let total = 0, todayCount = 0, income = 0;
      const todayStr = new Date().toDateString();

      jobsData.forEach(job => {
        total++;
        // Check if completed today
        if (job.status === "Completed" && job.finalizedDate === todayStr) {
          todayCount++;
          income += Number(job.totalCost || 0);
        }
      });
      setStats({ total, today: todayCount, income });
    });
    return unsubscribe;
  }, []);

  // 2. Handle Job Completion
  const handleFinalize = async (job, sizes, cost) => {
    if(!sizes || !cost) return alert("Please enter Sizes and Cost.");
    if(!confirm("Mark this job as completed?")) return;

    // A. Update Database
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes,
      totalCost: cost,
      status: "Completed",
      finalizedDate: new Date().toDateString()
    });

    // B. Generate PDF for Email
    const pdfBase64 = generatePDFBase64(job, sizes, cost);

    // C. Send Email via Netlify Function
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          name: job.name, 
          email: job.email, 
          jobId: job.id, 
          pdfBase64: pdfBase64 
        })
      });
      alert("Job Completed & Receipt Emailed!");
    } catch (err) {
      console.error(err);
      alert("Job saved locally, but Email sending failed.");
    }
  };

  return (
    <div className="container dashboard-container">
      {/* BRANDING HEADER */}
      <div className="brand-header center">
        <img src={COMPANY.logo} alt="Logo" className="logo" />
        <div className="brand-info">
          <h1>Studio Click Dashboard</h1>
          <p>{COMPANY.address}</p>
        </div>
      </div>

      {/* STATISTICS BAR */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Jobs</h3>
          <p>{stats.total}</p>
        </div>
        <div className="stat-card">
          <h3>Today's Jobs</h3>
          <p>{stats.today}</p>
        </div>
        <div className="stat-card highlight">
          <h3>Today's Income</h3>
          <p>LKR {stats.income}</p>
        </div>
      </div>

      {/* COMPACT JOB LIST */}
      <h2>Job List ({allJobs.length})</h2>
      <div className="job-list">
        {allJobs.map(job => (
          <JobItem key={job.id} job={job} onSave={handleFinalize} />
        ))}
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: COMPACT JOB ROW ---
function JobItem({ job, onSave }) {
  const [sizes, setSizes] = useState(job.sizes || '');
  const [cost, setCost] = useState(job.totalCost || '');
  const isCompleted = job.status === "Completed";

  // Manual Print
  const handlePrint = () => {
    const doc = createPDFDoc(job, sizes, cost);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  return (
    <div className={`job-row ${isCompleted ? 'row-completed' : 'row-pending'}`}>
      
      {/* LEFT: ID & Name */}
      <div className="row-info">
        <div className="row-main-text">
          <span className="job-id-tag">{job.id}</span>
          <strong>{job.name}</strong>
        </div>
        <div className="row-sub-text">
          {job.phone}
        </div>
      </div>

      {/* MIDDLE: Inputs or Details */}
      <div className="row-details">
        {isCompleted ? (
          <div className="completed-details">
            <span>Size: <strong>{job.sizes}</strong></span>
            <span>Cost: <strong>LKR {job.totalCost}</strong></span>
          </div>
        ) : (
          <div className="pending-inputs">
            <input 
              className="compact-input" 
              placeholder="Sizes (e.g. 4x6)" 
              value={sizes} 
              onChange={e => setSizes(e.target.value)} 
            />
            <input 
              className="compact-input" 
              type="number" 
              placeholder="Cost (LKR)" 
              value={cost} 
              onChange={e => setCost(e.target.value)} 
              style={{width: '100px'}}
            />
          </div>
        )}
      </div>

      {/* RIGHT: Actions */}
      <div className="row-actions">
        {/* Status Badge */}
        <span className={`status-badge-compact ${isCompleted ? 'badge-green' : 'badge-orange'}`}>
          {isCompleted ? "DONE" : "PENDING"}
        </span>

        {/* Action Buttons */}
        {!isCompleted && (
          <button className="btn-compact btn-save" onClick={() => onSave(job, sizes, cost)}>
            Save
          </button>
        )}
        <button className="btn-compact btn-print" onClick={handlePrint} title="Print Receipt">
          🖨️
        </button>
      </div>
    </div>
  );
}

// --- PDF HELPERS (Used for both Print and Email) ---
const createPDFDoc = (job, sizes, cost) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.text(COMPANY.name, 105, 20, null, null, "center");
  doc.setFontSize(10);
  doc.text(COMPANY.address, 105, 30, null, null, "center");
  doc.text(`Tel: ${COMPANY.phone}`, 105, 35, null, null, "center");
  doc.line(20, 40, 190, 40);

  // Body
  doc.setFontSize(16);
  doc.text("OFFICIAL RECEIPT", 105, 55, null, null, "center");
  
  doc.setFontSize(12);
  doc.text(`Receipt No: #${job.id}`, 20, 70);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 70);

  // Customer Box
  doc.setFillColor(245, 245, 245);
  doc.rect(20, 80, 170, 25, "F");
  doc.text(`Customer: ${job.name}`, 25, 90);
  doc.text(`Phone: ${job.phone}`, 25, 98);

  // Line Items
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
  doc.text("Thank you for choosing Studio Click!", 105, 180, null, null, "center");

  return doc;
};

const generatePDFBase64 = (job, sizes, cost) => {
  const doc = createPDFDoc(job, sizes, cost);
  return btoa(doc.output()); 
};