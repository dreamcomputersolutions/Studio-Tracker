import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export default function CustomerForm() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "jobs"), {
        ...formData,
        status: "Pending",
        createdAt: serverTimestamp()
      });
      alert("Registration Successful! Please wait for your photo session.");
      setFormData({ name: '', email: '', phone: '' });
    } catch (err) {
      console.error(err);
      alert("Error registering.");
    }
  };

  return (
    <div className="container form-container">
      <div className="brand-header center">
        {/* Placeholder Logo */}
        <img src="https://placehold.co/150x50?text=Studio+Click" alt="Logo" className="logo" />
        <h2>Welcome to Studio Click</h2>
        <p>336 Kaduwela Road, Battaramulla</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label>Full Name</label>
        <input 
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})} 
          required 
        />
        
        <label>Email Address</label>
        <input 
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})} 
          required 
        />
        
        <label>Phone Number</label>
        <input 
          value={formData.phone}
          onChange={(e) => setFormData({...formData, phone: e.target.value})} 
          required 
        />

        <button type="submit">Register for Job</button>
      </form>
      
      <p className="footer-contact">Questions? Call 077 731 1230</p>
    </div>
  );
}