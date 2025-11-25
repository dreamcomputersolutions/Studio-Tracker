import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// --- SUB-COMPONENT: Handles ONE single job ---
// This isolates the inputs so typing in one doesn't affect others.
function JobCard({ job, onSave }) {
  const [sizes, setSizes] = useState('');
  const [cost, setCost] = useState('');

  const handleSubmit = () => {
    if (!sizes || !cost) return alert("Please fill in Sizes and Cost");
    onSave(job, sizes, cost);
  };

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

      <div className="job-actions">
        <div className="input-group">
          <label>Photo Sizes</label>
          <input 
            type="text" 
            placeholder="e.g. 4x6, 10x15" 
            value={sizes}
            onChange={(e) => setSizes(e.target.value)} 
          />
        </div>

        <div className="input-group">
          <label>Total Cost (LKR)</label>
          <input 
            type="number" 
            placeholder="e.g. 1500" 
            value={cost}
            onChange={(e) => setCost(e.target.value)} 
          />
        </div>
      </div>

      <button className="save-btn" onClick={handleSubmit}>
        Mark Completed & Send Receipt
      </button>
    </div>
  );
}

// --- MAIN DASHBOARD COMPONENT ---
export default function AdminDashboard() {
  const [jobs, setJobs] = useState([]);

  // Fetch only "Pending" jobs
  useEffect(() => {
    const q = query(collection(db, "jobs"), where("status", "==", "Pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return unsubscribe;
  }, []);

  const handleFinalize = async (job, sizes, cost) => {
    // 1. Update Database (Pending -> Completed)
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes: sizes,
      totalCost: cost,
      status: "Completed" // This removes it from the list automatically
    });

    // 2. Send Email
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
      alert(`Receipt sent to ${job.name}!`);
    } catch (error) {
      alert("Job saved, but email failed.");
      console.error(error);
    }
  };

  return (
    <div className="container dashboard">
      <h2>Studio Job Queue</h2>
      {jobs.length === 0 ? (
        <p className="empty-state">No pending jobs. Waiting for customers...</p>
      ) : (
        <div className="job-list">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onSave={handleFinalize} />
          ))}
        </div>
      )}
    </div>
  );
}