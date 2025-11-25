import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, orderBy, query } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla, Sri Lanka",
  phone: "077 731 1230",
  logoPlaceholder: "https://placehold.co/150x50?text=Studio+Click"
};

export default function AdminDashboard() {
  const [allJobs, setAllJobs] = useState([]);
  const [stats, setStats] = useState({ total: 0, today: 0, income: 0 });

  // 1. Fetch ALL jobs (Ordered by Newest First)
  useEffect(() => {
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAllJobs(jobsData);

      // 2. Calculate Stats Real-time
      let total = 0;
      let todayCount = 0;
      let income = 0;
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
    // Update DB
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes,
      totalCost: cost,
      status: "Completed",
      finalizedDate: new Date().toDateString()
    });

    // Generate PDF & Email (Logic separated for clarity)
    generatePDF(job, sizes, cost);
    sendEmail(job, sizes, cost);
  };

  return (
    <div className="container dashboard-container">
      {/* BRAND HEADER */}
      <div className="brand-header center">
        <img src={COMPANY.logoPlaceholder} alt="Logo" className="logo" />
        <div className="brand-info">
          <h1>Studio Click Dashboard</h1>
          <p>{COMPANY.address}</p>
        </div>
      </div>

      {/* STATS BAR */}
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

      {/* JOB LIST */}
      <h2>Job List ({allJobs.length})</h2>
      <div className="job-list">
        {allJobs.map(job => (
          <JobItem key={job.id} job={job} onSave={handleFinalize} />
        ))}
      </div>
    </div>
  );
}

// --- INDIVIDUAL JOB COMPONENT ---
function JobItem({ job, onSave }) {
  const [sizes, setSizes] = useState(job.sizes || '');
  const [cost, setCost] = useState(job.totalCost || '');
  const isCompleted = job.status === "Completed";

  return (
    <div className={`job-card ${isCompleted ? 'card-completed' : 'card-pending'}`}>
      
      {/* Header with Status Badge */}
      <div className="job-header">
        <div>
          <h3>{job.name}</h3>
          <span className="job-phone">{job.phone}</span>
        </div>
        <span className={`status-badge ${isCompleted ? 'badge-green' : 'badge-orange'}`}>
          {job.status}
        </span>
      </div>
      <p className="job-email">{job.email}</p>

      {/* Logic: If Completed, show Text. If Pending, show Inputs */}
      <div className="job-inputs">
        {isCompleted ? (
          <>
            <div className="read-only-field">
              <label>Sizes</label>
              <strong>{job.sizes}</strong>
            </div>
            <div className="read-only-field">
              <label>Cost</label>
              <strong>LKR {job.totalCost}</strong>
            </div>
          </>
        ) : (
          <>
            <input 
              placeholder="Sizes (e.g. 4x6)" 
              value={sizes} onChange={e => setSizes(e.target.value)}
            />
            <input 
              placeholder="Cost (LKR)" type="number" 
              value={cost} onChange={e => setCost(e.target.value)}
            />
          </>
        )}
      </div>

      {/* Button only for Pending jobs */}
      {!isCompleted && (
        <button onClick={() => onSave(job, sizes, cost)}>
          Complete & Send Receipt
        </button>
      )}
    </div>
  );
}

// --- PDF & EMAIL HELPERS ---
const generatePDF = (job, sizes, cost) => {
  const doc = new jsPDF();
  doc.text("OFFICIAL RECEIPT - Studio Click", 20, 20);
  doc.text(`Customer: ${job.name}`, 20, 30);
  doc.text(`Total: LKR ${cost}`, 20, 40);
  doc.save(`Receipt_${job.name}.pdf`);
};

const sendEmail = async (job, sizes, cost) => {
  try {
    await fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({
        name: job.name, email: job.email, jobId: job.id, sizes, cost
      })
    });
    alert("Receipt Email Sent!");
  } catch (err) {
    console.error(err);
  }
};