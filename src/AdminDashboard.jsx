import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";

// --- BRANDING CONFIG ---
const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla, Sri Lanka",
  phone: "077 731 1230",
  logoPlaceholder: "https://placehold.co/150x50?text=Studio+Click" // You will replace this later
};

export default function AdminDashboard() {
  const [pendingJobs, setPendingJobs] = useState([]);
  const [stats, setStats] = useState({ totalJobs: 0, todayJobs: 0, todayIncome: 0 });

  // 1. Fetch Pending Jobs (For the list)
  useEffect(() => {
    const q = query(collection(db, "jobs"), where("status", "==", "Pending"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingJobs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return unsubscribe;
  }, []);

  // 2. Fetch Completed Jobs (For Statistics)
  useEffect(() => {
    const q = query(collection(db, "jobs"), where("status", "==", "Completed"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      let todayCount = 0;
      let income = 0;
      
      const todayStr = new Date().toDateString(); // e.g., "Mon Nov 25 2025"

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        total++;
        
        // Check if job was completed today (Assuming you save a 'completedAt' timestamp, 
        // strictly speaking we are checking if it EXISTS for now, you can refine date logic)
        // For simplicity, we are using local check:
        if (data.finalizedDate === todayStr) {
          todayCount++;
          income += Number(data.totalCost || 0);
        }
      });

      setStats({ totalJobs: total, todayJobs: todayCount, todayIncome: income });
    });
    return unsubscribe;
  }, []);

  // --- PDF GENERATOR ---
  const generatePDF = (job, sizes, cost) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text(COMPANY.name, 105, 20, null, null, "center");
    
    doc.setFontSize(10);
    doc.text(COMPANY.address, 105, 30, null, null, "center");
    doc.text(`Tel: ${COMPANY.phone}`, 105, 35, null, null, "center");

    doc.line(20, 40, 190, 40); // Horizontal line

    // Receipt Details
    doc.setFontSize(16);
    doc.text("OFFICIAL RECEIPT", 105, 55, null, null, "center");

    doc.setFontSize(12);
    doc.text(`Receipt No: #${job.id.substring(0, 6).toUpperCase()}`, 20, 70);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 70);

    // Customer Details
    doc.setFillColor(240, 240, 240);
    doc.rect(20, 80, 170, 25, "F");
    doc.text(`Customer: ${job.name}`, 25, 90);
    doc.text(`Phone: ${job.phone}`, 25, 98);

    // Items
    let y = 120;
    doc.text("Description", 20, y);
    doc.text("Amount (LKR)", 160, y);
    doc.line(20, y + 2, 190, y + 2);

    y += 15;
    doc.text(`Photo Job (${sizes})`, 20, y);
    doc.text(`${cost}.00`, 160, y);

    // Total
    y += 20;
    doc.setFont(undefined, 'bold');
    doc.text("TOTAL:", 120, y);
    doc.text(`${cost}.00`, 160, y);

    // Footer
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text("Thank you for choosing Studio Click!", 105, 160, null, null, "center");

    // Save
    doc.save(`Receipt_${job.name}.pdf`);
  };

  const handleFinalize = async (job, sizes, cost) => {
    // 1. Update Database
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes: sizes,
      totalCost: cost,
      status: "Completed",
      finalizedDate: new Date().toDateString() // Crucial for "Today's Stats"
    });

    // 2. Generate PDF locally
    generatePDF(job, sizes, cost);

    // 3. Send Email
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          name: job.name,
          email: job.email,
          jobId: job.id,
          sizes: sizes,
          cost: cost
        })
      });
      alert("Job Completed! Receipt Downloaded & Email Sent.");
    } catch (error) {
      console.error(error);
      alert("Job saved and PDF downloaded, but Email failed.");
    }
  };

  return (
    <div className="container dashboard-container">
      {/* HEADER & BRANDING */}
      <div className="brand-header">
        <img src={COMPANY.logoPlaceholder} alt="Logo" className="logo" />
        <div className="brand-info">
          <h1>{COMPANY.name} Dashboard</h1>
          <p>{COMPANY.address}</p>
        </div>
      </div>

      {/* STATISTICS CARDS */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Jobs</h3>
          <p>{stats.totalJobs}</p>
        </div>
        <div className="stat-card">
          <h3>Today's Jobs</h3>
          <p>{stats.todayJobs}</p>
        </div>
        <div className="stat-card highlight">
          <h3>Today's Income</h3>
          <p>LKR {stats.todayIncome}</p>
        </div>
      </div>

      <h2>Pending Jobs Queue</h2>
      
      {pendingJobs.length === 0 ? (
        <p className="empty-state">All caught up! No pending jobs.</p>
      ) : (
        <div className="job-list">
          {pendingJobs.map(job => (
            <JobItem key={job.id} job={job} onSave={handleFinalize} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- SEPARATE COMPONENT FOR EACH JOB CARD ---
function JobItem({ job, onSave }) {
  const [sizes, setSizes] = useState('');
  const [cost, setCost] = useState('');

  return (
    <div className="job-card">
      <div className="job-header">
        <div>
          <h3>{job.name}</h3>
          <span className="job-phone">{job.phone}</span>
        </div>
        <span className="status-badge">Pending</span>
      </div>
      <p className="job-email">{job.email}</p>

      <div className="job-inputs">
        <input 
          placeholder="Sizes (e.g. 4x6, 8x10)" 
          value={sizes}
          onChange={e => setSizes(e.target.value)}
        />
        <input 
          placeholder="Cost (LKR)" 
          type="number" 
          value={cost}
          onChange={e => setCost(e.target.value)}
        />
      </div>

      <button onClick={() => onSave(job, sizes, cost)}>
        Complete, PDF & Email
      </button>
    </div>
  );
}