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
        // 1. Read the counter
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await transaction.get(counterRef);

        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = counterDoc.data().current + 1;
        }

        // 2. Format ID (e.g., SC-0005)
        const newId = `SC-${String(newCount).padStart(4, '0')}`;

        // 3. Update Counter
        transaction.set(counterRef, { current: newCount });

        // 4. Create Job with custom ID
        const jobRef = doc(db, "jobs", newId);
        transaction.set(jobRef, {
          ...formData,
          status: "Pending",
          createdAt: serverTimestamp()
        });
      });

      alert("Registered Successfully! Please wait for your turn.");
      setFormData({ name: '', email: '', phone: '' });
    } catch (err) {
      console.error(err);
      alert("Error registering. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="container form-container">
      <div className="brand-header center">
        {/* UPDATED LOGO PATH */}
        <img src="/LOGO.png" alt="Studio Click" className="logo" />
        <h2>Welcome to Studio Click</h2>
        <p>336 Kaduwela Road, Battaramulla</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label>Full Name</label>
        <input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
        
        <label>Email Address</label>
        <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
        
        <label>Phone Number</label>
        <input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />

        <button type="submit" disabled={loading}>
          {loading ? "Registering..." : "Register for Job"}
        </button>
      </form>
      
      <p className="footer-contact">Questions? Call 077 731 1230</p>
    </div>
  );
}