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
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await transaction.get(counterRef);
        
        let newCount = 1;
        if (counterDoc.exists()) {
          newCount = counterDoc.data().current + 1;
        }

        const newId = `SC-${String(newCount).padStart(4, '0')}`;
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
      <div style={{textAlign:'center', marginBottom:'30px'}}>
        <img src="/LOGO.png" alt="Studio Click" style={{height:'80px'}} />
        <h1>Welcome to Studio Click</h1>
        <p style={{color:'#666'}}>336 Kaduwela Road, Battaramulla</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label>Full Name</label>
        <input 
          value={formData.name} 
          onChange={(e) => setFormData({...formData, name: e.target.value})} 
          required 
          placeholder="Enter your name"
        />
        
        <label>Email Address</label>
        <input 
          type="email"
          value={formData.email} 
          onChange={(e) => setFormData({...formData, email: e.target.value})} 
          required 
          placeholder="name@example.com"
        />
        
        <label>Phone Number</label>
        <input 
          value={formData.phone} 
          onChange={(e) => setFormData({...formData, phone: e.target.value})} 
          required 
          placeholder="077..."
        />

        <button type="submit" className="btn-save" style={{width:'100%', padding:'15px', fontSize:'1.1rem'}}>
          {loading ? "Registering..." : "Register for Job"}
        </button>
      </form>
      
      <p style={{textAlign:'center', marginTop:'20px', color:'#999'}}>Questions? Call 077 731 1230</p>
    </div>
  );
}