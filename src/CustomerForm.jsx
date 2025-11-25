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
        if (counterDoc.exists()) newCount = counterDoc.data().current + 1;
        
        const newId = `SC-${String(newCount).padStart(4, '0')}`;
        transaction.set(counterRef, { current: newCount });
        
        const jobRef = doc(db, "jobs", newId);
        transaction.set(jobRef, {
          ...formData,
          status: "Pending",
          createdAt: serverTimestamp()
        });
      });
      alert(`Registration Successful!`);
      setFormData({ name: '', email: '', phone: '' });
    } catch (err) { alert("Error."); }
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
        <div style={{marginBottom:'15px'}}>
          <label style={{display:'block', marginBottom:'5px', fontWeight:'600'}}>Full Name</label>
          <input 
            value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required 
            style={{width:'100%', padding:'12px', border:'1px solid #ccc', borderRadius:'8px', boxSizing:'border-box'}}
          />
        </div>
        
        <div style={{marginBottom:'15px'}}>
          <label style={{display:'block', marginBottom:'5px', fontWeight:'600'}}>Email Address</label>
          <input 
            type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required 
            style={{width:'100%', padding:'12px', border:'1px solid #ccc', borderRadius:'8px', boxSizing:'border-box'}}
          />
        </div>
        
        <div style={{marginBottom:'15px'}}>
          <label style={{display:'block', marginBottom:'5px', fontWeight:'600'}}>Phone Number</label>
          <input 
            value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required 
            style={{width:'100%', padding:'12px', border:'1px solid #ccc', borderRadius:'8px', boxSizing:'border-box'}}
          />
        </div>

        <button type="submit" className="btn-save" style={{width:'100%', padding:'15px', fontSize:'1rem'}}>
          {loading ? "Registering..." : "Register for Job"}
        </button>
      </form>
      <p style={{textAlign:'center', marginTop:'20px', color:'#999'}}>Questions? Call 077 731 1230</p>
    </div>
  );
}