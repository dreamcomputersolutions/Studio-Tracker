import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, query, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";
import ProductManager from './ProductManager';

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla",
  phone: "077 731 1230",
  logo: "/LOGO.png"
};

export default function AdminDashboard() {
  const [userRole, setUserRole] = useState(null); 
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [showJobModal, setShowJobModal] = useState(false);
  const [stats, setStats] = useState({ totalJobs: 0, cashIncome: 0, cardIncome: 0, dueBalance: 0 });

  // --- 1. DATA FETCHING ---
  useEffect(() => {
    // Products
    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map(d => ({...d.data(), id: d.id})));
    });

    // Jobs
    const unsubJobs = onSnapshot(collection(db, "jobs"), (snap) => {
      let data = snap.docs.map(d => ({...d.data(), id: d.id}));
      
      // Sort: Newest First
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      
      setJobs(data);

      // Calc Stats
      let cash = 0, card = 0, due = 0;
      data.forEach(job => {
        // Handle V1 and V2 Data structures
        const total = Number(job.totalCost || job.cost || 0);
        const adv = Number(job.advance || 0);
        
        let paid = adv;
        if (job.status === "Completed") {
          // If completed, assume full payment unless balance exists
          paid = total; 
        }

        if(job.payMethod === "Cash") cash += paid;
        if(job.payMethod === "Card") card += paid;
        
        // Calculate Due
        const balance = total - paid;
        if(job.status !== "Completed" && balance > 0) due += balance;
      });
      setStats({ totalJobs: data.length, cashIncome: cash, cardIncome: card, dueBalance: due });
    });

    return () => { unsubProd(); unsubJobs(); };
  }, []);

  // --- 2. ACTIONS ---
  const handleNotifyCustomer = async (job) => {
    if(!confirm("Send 'Ready to Collect' email?")) return;
    
    // Fallback for V1 data
    const cName = job.customerName || job.name;
    const cEmail = job.customerEmail || job.email;

    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          type: 'READY_NOTIFY',
          name: cName,
          email: cEmail,
          jobId: job.id
        })
      });
      alert("Notification Email Sent!");
    } catch(e) { alert("Email Failed"); console.error(e); }
  };

  const handleCompleteJob = async (job) => {
    const total = Number(job.totalCost || job.cost || 0);
    const adv = Number(job.advance || 0);
    const balance = total - adv;

    if(balance > 0 && !confirm(`Customer owes LKR ${balance}. Mark as Paid & Completed?`)) return;

    // 1. Generate PDF String
    const pdfBase64 = generatePDFBase64(job);
    
    // Fallback variables
    const cName = job.customerName || job.name;
    const cEmail = job.customerEmail || job.email;

    // 2. Update DB
    await updateDoc(doc(db, "jobs", job.id), {
      status: "Completed",
      balance: 0, // Mark as fully paid
      completedAt: serverTimestamp()
    });

    // 3. Send Email
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          type: 'RECEIPT',
          name: cName,
          email: cEmail,
          jobId: job.id,
          pdfBase64: pdfBase64
        })
      });
      alert("Job Completed & Receipt Sent!");
    } catch(e) { 
      console.error(e);
      alert("Job saved but Email failed."); 
    }
  };

  // --- 3. LOGIN UI ---
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

  // --- 4. DASHBOARD UI ---
  return (
    <div className="container dashboard-container">
      <div className="header-v2">
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <img src={COMPANY.logo} className="logo-small" />
          <div>
            <h2 style={{margin:0}}>Studio Dashboard</h2>
            <span className="badge">{userRole.toUpperCase()}</span>
          </div>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {userRole === 'admin' && (
            <>
              <button onClick={() => setShowJobModal(true)} className="btn-new">+ New Job</button>
              <button onClick={() => setView('products')} className="btn-secondary">Products</button>
            </>
          )}
          <button onClick={() => setUserRole(null)} className="btn-logout">Logout</button>
        </div>
      </div>

      {view === 'products' && <ProductManager onClose={() => setView('dashboard')} />}

      {showJobModal && <NewJobModal products={products} onClose={() => setShowJobModal(false)} />}

      {userRole === 'admin' && (
        <div className="stats-grid">
          <div className="stat-card"><h3>Total Jobs</h3><p>{stats.totalJobs}</p></div>
          <div className="stat-card"><h3>Cash Income</h3><p>LKR {stats.cashIncome}</p></div>
          <div className="stat-card"><h3>Card Income</h3><p>LKR {stats.cardIncome}</p></div>
          <div className="stat-card highlight"><h3>Due Balance</h3><p>LKR {stats.dueBalance}</p></div>
        </div>
      )}

      <div className="job-list-v2">
        {jobs.length === 0 && <p style={{textAlign:'center'}}>No jobs found.</p>}
        {jobs.map(job => {
          // DATA MAPPING (Handle Old vs New)
          const name = job.customerName || job.name || "Unknown";
          const product = job.productName || job.sizes || "Custom Service";
          const total = job.totalCost || job.cost || 0;
          const paid = job.advance || 0;
          const due = (job.status === "Completed") ? 0 : (total - paid);

          return (
            <div key={job.id} className={`job-row-v2 ${job.status}`}>
              <div className="job-date">
                <span className="date-box">
                  {job.dueDate ? new Date(job.dueDate).getDate() : "--"} <br/>
                  <small>{job.dueDate ? new Date(job.dueDate).toLocaleString('default', { month: 'short' }) : ""}</small>
                </span>
              </div>
              
              <div className="job-info">
                <div className="job-title">
                  <strong>{job.id}</strong> - {name}
                  {job.status === "Pending" && <span className="badge-pending">Processing</span>}
                  {job.status === "Completed" && <span className="badge-completed">Done</span>}
                </div>
                <div className="job-product">
                  {product} {job.productCode ? `(${job.productCode})` : ''}
                </div>
                <div className="job-finance">
                  Total: {total} | Paid: {paid} | 
                  <span style={{color: due > 0 ? 'red' : 'green', fontWeight:'bold', marginLeft:'5px'}}>
                    Due: {due}
                  </span>
                </div>
              </div>

              <div className="job-actions-v2">
                {job.status !== "Completed" && (
                  <>
                    <button onClick={() => handleNotifyCustomer(job)} className="btn-icon">📧 Ready</button>
                    {userRole === 'admin' && (
                      <button onClick={() => handleCompleteJob(job)} className="btn-save">Finish</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- NEW JOB MODAL ---
function NewJobModal({ products, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dueDate: '',
    productId: '', payMethod: 'Cash', advance: ''
  });

  const handleSubmit = async () => {
    if(!formData.name || !formData.productId) return alert("Please fill Name and Select Product");

    const selectedProduct = products.find(p => p.id === formData.productId);
    
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
        <div style={{marginBottom:'10px'}}>
          <label>Customer Name</label>
          <input onChange={e=>setFormData({...formData, name:e.target.value})} placeholder="John Doe"/>
        </div>
        <div style={{marginBottom:'10px'}}>
          <label>Email</label>
          <input type="email" onChange={e=>setFormData({...formData, email:e.target.value})} placeholder="email@example.com"/>
        </div>
        <div style={{marginBottom:'10px'}}>
          <label>Select Product</label>
          <select onChange={e=>setFormData({...formData, productId:e.target.value})}>
            <option value="">-- Select --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name} ({p.price})</option>)}
          </select>
        </div>
        <div style={{marginBottom:'10px'}}>
          <label>Due Date</label>
          <input type="date" onChange={e=>setFormData({...formData, dueDate:e.target.value})} />
        </div>
        
        <label>Payment (Advance)</label>
        <div style={{display:'flex', gap:'10px'}}>
          <select onChange={e=>setFormData({...formData, payMethod:e.target.value})}>
            <option>Cash</option><option>Card</option>
          </select>
          <input type="number" placeholder="Amount Paid" onChange={e=>setFormData({...formData, advance:e.target.value})} />
        </div>
        
        <div style={{marginTop:'20px', display:'flex', gap:'10px'}}>
          <button onClick={handleSubmit} className="btn-save">Create</button>
          <button onClick={onClose} style={{background:'#ccc', border:'none', padding:'10px', borderRadius:'8px', cursor:'pointer'}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// --- PDF GENERATOR ---
const generatePDFBase64 = (job) => {
  const doc = new jsPDF();
  const cName = job.customerName || job.name || "Customer";
  const cProduct = job.productName || job.sizes || "Service";
  const total = Number(job.totalCost || job.cost || 0);
  const paid = Number(job.advance || 0);

  doc.setFontSize(20);
  doc.text(COMPANY.name, 105, 20, null, null, "center");
  doc.setFontSize(10);
  doc.text(COMPANY.address, 105, 30, null, null, "center");
  doc.text(`Tel: ${COMPANY.phone}`, 105, 35, null, null, "center");
  doc.line(20, 40, 190, 40);

  doc.setFontSize(16);
  doc.text("FINAL RECEIPT", 105, 55, null, null, "center");

  doc.setFontSize(12);
  doc.text(`Job ID: ${job.id}`, 20, 70);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 70);
  doc.text(`Customer: ${cName}`, 20, 80);

  let y = 100;
  doc.text("Description", 20, y);
  doc.text("Amount", 160, y);
  doc.line(20, y+2, 190, y+2);
  y += 15;
  
  doc.text(cProduct, 20, y);
  doc.text(`${total}.00`, 160, y);
  
  y += 20;
  doc.text(`Advance Paid:`, 100, y);
  doc.text(`${paid}.00`, 160, y);
  y += 10;
  doc.text(`Balance Paid:`, 100, y);
  doc.text(`${total - paid}.00`, 160, y);
  
  doc.setFont(undefined, 'bold');
  y += 15;
  doc.text("TOTAL:", 100, y);
  doc.text(`${total}.00`, 160, y);

  return btoa(doc.output()); 
};