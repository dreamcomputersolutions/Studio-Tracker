import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, query, orderBy, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";
import ProductManager from './ProductManager'; // Import the new file

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla",
  phone: "077 731 1230",
  logo: "/LOGO.png"
};

export default function AdminDashboard() {
  // --- STATES ---
  const [userRole, setUserRole] = useState(null); // 'admin' or 'staff'
  const [view, setView] = useState('dashboard'); // 'dashboard', 'products'
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [showJobModal, setShowJobModal] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({ 
    totalJobs: 0, cashIncome: 0, cardIncome: 0, dueBalance: 0 
  });

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    // Fetch Products for Dropdown
    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map(d => ({...d.data(), id: d.id})));
    });

    // Fetch Jobs
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsubJobs = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({...d.data(), id: d.id}));
      setJobs(data);

      // Calculate V2.0 Stats
      let cash = 0, card = 0, due = 0;
      data.forEach(job => {
        // Calculate Income based on Pay Method
        const paid = Number(job.advance || 0) + (job.status === "Completed" ? Number(job.balance || 0) : 0);
        
        if(job.payMethod === "Cash") cash += paid;
        if(job.payMethod === "Card") card += paid;
        
        // Calculate Pending Balance
        if(job.status !== "Completed") due += Number(job.balance || 0);
      });
      setStats({ totalJobs: data.length, cashIncome: cash, cardIncome: card, dueBalance: due });
    });

    return () => { unsubProd(); unsubJobs(); };
  }, []);

  // --- 2. ACTIONS ---
  
  const handleNotifyCustomer = async (job) => {
    // Send "Ready to Collect" Email
    const confirm = window.confirm("Send 'Ready to Collect' email to customer?");
    if(!confirm) return;

    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          type: 'READY_NOTIFY', // New Flag for Backend
          name: job.customerName,
          email: job.customerEmail,
          jobId: job.id
        })
      });
      alert("Notification Sent!");
    } catch(e) { alert("Email failed"); }
  };

  const handleCompleteJob = async (job) => {
    if(job.balance > 0 && !window.confirm(`Customer owes LKR ${job.balance}. Mark as paid & completed?`)) return;
    
    // Generate Final Receipt PDF
    const pdfBase64 = generatePDFBase64(job, "FINAL");

    await updateDoc(doc(db, "jobs", job.id), {
      status: "Completed",
      completedAt: serverTimestamp()
    });

    // Email Final Receipt
    await fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({
        type: 'RECEIPT',
        name: job.customerName,
        email: job.customerEmail,
        jobId: job.id,
        pdfBase64
      })
    });
    alert("Job Completed!");
  };

  // --- 3. LOGIN SCREEN (Simple Version) ---
  if (!userRole) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <img src={COMPANY.logo} className="logo" alt="logo"/>
          <h2>Studio Tracker V2.0</h2>
          <button onClick={() => setUserRole('admin')} className="btn-admin">Admin Login</button>
          <button onClick={() => setUserRole('staff')} className="btn-staff">Staff View</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container dashboard-container">
      {/* HEADER */}
      <div className="header-v2">
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <img src={COMPANY.logo} className="logo-small" />
          <div>
            <h2 style={{margin:0}}>Studio Dashboard</h2>
            <span className="badge">{userRole.toUpperCase()} MODE</span>
          </div>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {userRole === 'admin' && (
            <button onClick={() => setShowJobModal(true)} className="btn-new">+ New Job</button>
          )}
          {userRole === 'admin' && (
            <button onClick={() => setView('products')} className="btn-secondary">Products</button>
          )}
          <button onClick={() => setUserRole(null)} className="btn-logout">Logout</button>
        </div>
      </div>

      {/* PRODUCT MANAGER POPUP */}
      {view === 'products' && <ProductManager onClose={() => setView('dashboard')} />}

      {/* NEW JOB MODAL */}
      {showJobModal && (
        <NewJobModal 
          products={products} 
          onClose={() => setShowJobModal(false)} 
        />
      )}

      {/* STATS (Admin Only) */}
      {userRole === 'admin' && (
        <div className="stats-grid">
          <div className="stat-card"><h3>Total Jobs</h3><p>{stats.totalJobs}</p></div>
          <div className="stat-card"><h3>Cash Income</h3><p>LKR {stats.cashIncome}</p></div>
          <div className="stat-card"><h3>Card Income</h3><p>LKR {stats.cardIncome}</p></div>
          <div className="stat-card highlight"><h3>Due Balance</h3><p>LKR {stats.dueBalance}</p></div>
        </div>
      )}

      {/* JOB LIST */}
      <div className="job-list-v2">
        {jobs.map(job => (
          <div key={job.id} className={`job-row-v2 ${job.status}`}>
            <div className="job-date">
              <span className="date-box">
                {new Date(job.dueDate).getDate()} <br/>
                <small>{new Date(job.dueDate).toLocaleString('default', { month: 'short' })}</small>
              </span>
            </div>
            
            <div className="job-info">
              <div className="job-title">
                <strong>{job.id}</strong> - {job.customerName}
                {job.status === "Pending" && <span className="badge-pending">Processing</span>}
                {job.status === "Completed" && <span className="badge-completed">Done</span>}
              </div>
              <div className="job-product">
                {job.productName} ({job.productCode})
              </div>
              <div className="job-finance">
                Total: {job.totalCost} | Paid: {job.advance} | 
                <span style={{color: job.balance > 0 ? 'red' : 'green', fontWeight:'bold'}}>
                  Due: {job.balance}
                </span>
              </div>
            </div>

            <div className="job-actions-v2">
              {job.status !== "Completed" && (
                <>
                  <button onClick={() => handleNotifyCustomer(job)} className="btn-icon" title="Notify Ready">📧 Ready</button>
                  {userRole === 'admin' && (
                    <button onClick={() => handleCompleteJob(job)} className="btn-save">Finish</button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- NEW JOB MODAL COMPONENT ---
function NewJobModal({ products, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dueDate: '',
    productId: '', payMethod: 'Cash', advance: ''
  });

  const selectedProduct = products.find(p => p.id === formData.productId);

  const handleSubmit = async () => {
    if(!formData.name || !formData.productId) return alert("Details Missing");

    await runTransaction(db, async (t) => {
      const counterRef = doc(db, "counters", "jobCounter");
      const counterDoc = await t.get(counterRef);
      const newCount = (counterDoc.exists() ? counterDoc.data().current : 0) + 1;
      const newId = `SC-${String(newCount).padStart(4, '0')}`;
      t.set(counterRef, { current: newCount });

      const total = Number(selectedProduct.price);
      const adv = Number(formData.advance || 0);

      t.set(doc(db, "jobs", newId), {
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        dueDate: formData.dueDate,
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        totalCost: total,
        advance: adv,
        balance: total - adv,
        payMethod: formData.payMethod,
        status: "Pending",
        createdAt: serverTimestamp()
      });
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Create New Job</h2>
        
        <label>Customer Details</label>
        <input placeholder="Name" onChange={e=>setFormData({...formData, name:e.target.value})} />
        <input placeholder="Phone" onChange={e=>setFormData({...formData, phone:e.target.value})} />
        <input placeholder="Email" type="email" onChange={e=>setFormData({...formData, email:e.target.value})} />

        <label>Job Details</label>
        <select onChange={e=>setFormData({...formData, productId:e.target.value})}>
          <option value="">Select Product...</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name} (LKR {p.price})</option>)}
        </select>
        <input type="date" onChange={e=>setFormData({...formData, dueDate:e.target.value})} />

        <label>Payment</label>
        <div style={{display:'flex', gap:'10px'}}>
          <select onChange={e=>setFormData({...formData, payMethod:e.target.value})}>
            <option>Cash</option><option>Card</option>
          </select>
          <input type="number" placeholder="Advance Amount" onChange={e=>setFormData({...formData, advance:e.target.value})} />
        </div>

        <div style={{marginTop:'20px', display:'flex', gap:'10px'}}>
          <button onClick={handleSubmit} className="btn-save">Create Job</button>
          <button onClick={onClose} style={{background:'#ccc'}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// --- PDF HELPER (Updated for Logo) ---
// Note: We need to convert the Logo URL to Base64 in a real app, 
// but for now, we will assume the logo is loaded or skip it to prevent CORS errors.
const generatePDFBase64 = (job, type) => {
  const doc = new jsPDF();
  doc.text(COMPANY.name, 20, 20);
  doc.text(`Receipt for ${job.id}`, 20, 30);
  doc.text(`Total: ${job.totalCost}`, 20, 40);
  doc.text(`Paid: ${job.advance}`, 20, 50);
  doc.text(`Balance: ${job.balance}`, 20, 60);
  return btoa(doc.output()); 
};