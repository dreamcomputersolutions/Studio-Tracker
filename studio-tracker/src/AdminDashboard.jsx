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
    <div style={{ padding: '20px' }}>
      <h2>Studio Dashboard</h2>
      {jobs.map(job => (
        <div key={job.id} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px 0' }}>
          <h3>{job.name} ({job.phone})</h3>
          <p>Email: {job.email}</p>
          
          <input placeholder="Photo Sizes (e.g. 4x6, 10x15)" onChange={(e) => setSizes(e.target.value)} />
          <input placeholder="Total Cost (LKR)" type="number" onChange={(e) => setCost(e.target.value)} />
          
          <button onClick={() => handleFinalize(job)} style={{ marginLeft: '10px', backgroundColor: 'green', color: 'white' }}>
            Save & Send Email
          </button>
        </div>
      ))}
    </div>
  );
}