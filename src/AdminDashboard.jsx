import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function AdminDashboard() {
  const [jobs, setJobs] = useState([]);
  const [sizes, setSizes] = useState('');
  const [cost, setCost] = useState('');

  // Fetch only "Pending" jobs
  useEffect(() => {
    const q = query(collection(db, "jobs"), where("status", "==", "Pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setJobs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    return unsubscribe;
  }, []);

  const handleFinalize = async (job) => {
    if(!sizes || !cost) return alert("Enter Cost and Sizes!");

    // 1. Update Firebase
    const jobRef = doc(db, "jobs", job.id);
    await updateDoc(jobRef, {
      sizes: sizes,
      cost: cost,
      status: "Completed"
    });

    // 2. Trigger Netlify Email Function
    // Note: Use absolute URL if testing locally, or relative '/' if deployed
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

    alert("Job Saved & Email Sent!");
    setSizes('');
    setCost('');
  };

 return (
    <div className="dashboard-container">
      <h2>Studio Dashboard</h2>
      {jobs.length === 0 && <p style={{textAlign: 'center'}}>No pending jobs.</p>}
      
      {jobs.map(job => (
        <div key={job.id} className="job-card">
          <div className="job-header">
            <h3>{job.name || "Unknown"}</h3>
            <span style={{color: '#666'}}>{job.phone}</span>
          </div>
          <p style={{marginTop: 0, color: '#666'}}>{job.email}</p>
          
          <div className="job-details">
            <input 
              placeholder="Sizes (e.g. 4x6)" 
              value={sizes}
              onChange={(e) => setSizes(e.target.value)} 
            />
            <input 
              placeholder="Cost (LKR)" 
              type="number" 
              value={cost}
              onChange={(e) => setCost(e.target.value)} 
            />
          </div>
          
          <button 
            onClick={() => handleFinalize(job)} 
            style={{marginTop: '15px', backgroundColor: '#10B981'}}>
            Save & Send Receipt
          </button>
        </div>
      ))}
    </div>
  );
}