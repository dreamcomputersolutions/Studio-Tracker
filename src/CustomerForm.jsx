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
        status: "Pending", // Admin needs to finish this
        createdAt: serverTimestamp()
      });
      alert("Registered! Please wait for the staff.");
      setFormData({ name: '', email: '', phone: '' }); // Reset form
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Customer Registration</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Name" onChange={(e) => setFormData({...formData, name: e.target.value})} required />
        <br /><br />
        <input placeholder="Email" type="email" onChange={(e) => setFormData({...formData, email: e.target.value})} required />
        <br /><br />
        <input placeholder="Phone" onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
        <br /><br />
        <button type="submit">Register</button>
      </form>
    </div>
  );
}