import { useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export default function CustomerForm() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Get Counter
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await transaction.get(counterRef);
        
        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = counterDoc.data().current + 1;
        }

        // 2. Create ID
        const newId = `SC-${String(newCount).padStart(4, '0')}`;
        
        // 3. Update
        transaction.set(counterRef, { current: newCount });
        
        const jobRef = doc(db, "jobs", newId);
        transaction.set(jobRef, {
          ...formData,
          status: "Pending",
          createdAt: serverTimestamp()
        });
      });

      alert(`Registration Successful! Please take a seat.`);
      setFormData({ name: '', email: '', phone: '' });
    } catch (err) {
      console.error(err);
      alert("System Error. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="container form-container">
      <div className="brand-header">
        <img src="/LOGO.png" alt="Studio Click" className="logo" />
        <h1>Welcome to Studio Click</h1>
        <p>336 Kaduwela Road, Battaramulla</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Full Name</label>
          <input 
            className="form-input"
            value={formData.name} 
            onChange={(e) => setFormData({...formData, name: e.target.value})} 
            required 
            placeholder="Enter your name"
          />
        </div>
        
        <div className="form-group">
          <label>Email Address</label>
          <input 
            type="email"
            className="form-input"
            value={formData.email} 
            onChange={(e) => setFormData({...formData, email: e.target.value})} 
            required 
            placeholder="name@example.com"
          />
        </div>
        
        <div className="form-group">
          <label>Phone Number</label>
          <input 
            className="form-input"
            value={formData.phone} 
            onChange={(e) => setFormData({...formData, phone: e.target.value})} 
            required 
            placeholder="077..."
          />
        </div>

        <button type="submit" className="btn-submit" disabled={loading}>
          {loading ? "Registering..." : "Register for Job"}
        </button>
      </form>
      
      <p className="footer-contact">Questions? Call 077 731 1230</p>
    </div>
  );
}