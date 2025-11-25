import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, query, runTransaction } from 'firebase/firestore';
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
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null); // If null, we are creating new. If object, we are editing.

  // Stats State
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
      // Sort Newest First
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setJobs(data);

      // Calc Stats
      let cash = 0, card = 0, due = 0;
      data.forEach(job => {
        const total = Number(job.totalCost || 0);
        const paid = Number(job.advance || 0) + (job.status === "Completed" ? Number(job.balance || 0) : 0);
        
        if(job.payMethod === "Cash") cash += paid;
        if(job.payMethod === "Card") card += paid;
        if(job.status !== "Completed") due += Number(job.balance || 0);
      });
      setStats({ totalJobs: data.length, cashIncome: cash, cardIncome: card, dueBalance: due });
    });

    return () => { unsubProd(); unsubJobs(); };
  }, []);

  // --- 2. ACTIONS ---
  
  // Open Modal for New Job
  const handleNewJob = () => {
    setEditingJob(null); // Clear editing state
    setShowModal(true);
  };

  // Open Modal to Edit Existing Job
  const handleEditJob = (job) => {
    setEditingJob(job); // Load job data into modal
    setShowModal(true);
  };

  const handleNotifyCustomer = async (job) => {
    if(!confirm("Send 'Ready to Collect' email?")) return;
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({ type: 'READY_NOTIFY', name: job.customerName, email: job.customerEmail, jobId: job.id })
      });
      alert("Email Sent!");
    } catch(e) { alert("Failed"); }
  };

  const handleCompleteJob = async (job) => {
    if(job.balance > 0 && !confirm(`Customer owes LKR ${job.balance}. Mark as Paid & Completed?`)) return;
    
    // Generate PDF
    const pdfBase64 = generatePDFBase64(job);

    await updateDoc(doc(db, "jobs", job.id), {
      status: "Completed",
      balance: 0, // Assume fully paid
      completedAt: serverTimestamp()
    });

    // Send Final Receipt
    fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({ type: 'RECEIPT', name: job.customerName, email: job.customerEmail, jobId: job.id, pdfBase64 })
    });
    alert("Completed!");
  };

  // --- 3. LOGIN SCREEN ---
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
            <span className="badge">{userRole.toUpperCase()}</span>
          </div>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {userRole === 'admin' && (
            <>
              <button onClick={handleNewJob} className="btn-new">+ New Job</button>
              <button onClick={() => setView('products')} className="btn-secondary">Products</button>
            </>
          )}
          <button onClick={() => setUserRole(null)} className="btn-logout">Logout</button>
        </div>
      </div>

      {/* POPUPS */}
      {view === 'products' && <ProductManager onClose={() => setView('dashboard')} />}
      
      {showModal && (
        <JobModal 
          job={editingJob} 
          products={products} 
          onClose={() => setShowModal(false)} 
        />
      )}

      {/* STATS */}
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
        {jobs.map(job => {
          // Check if job is missing details (created by customer)
          const isMissingDetails = !job.productCode || !job.totalCost;

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
                  <strong>{job.id}</strong> - {job.customerName || job.name}
                  {job.status === "Pending" && <span className="badge-pending">Processing</span>}
                  {job.status === "Completed" && <span className="badge-completed">Done</span>}
                </div>
                <div className="job-product">
                  {isMissingDetails ? 
                    <span style={{color:'red'}}>⚠ Waiting for Details</span> : 
                    `${job.productName} (${job.productCode})`
                  }
                </div>
                <div className="job-finance">
                  Total: {job.totalCost || 0} | Paid: {job.advance || 0} | 
                  <span style={{color: job.balance > 0 ? 'red' : 'green', fontWeight:'bold', marginLeft:'5px'}}>
                    Due: {job.balance || 0}
                  </span>
                </div>
              </div>

              <div className="job-actions-v2">
                {job.status !== "Completed" && (
                  <>
                    {/* BUTTON 1: Add Details (If new) OR Notify (If in progress) */}
                    {isMissingDetails ? (
                      <button onClick={() => handleEditJob(job)} className="btn-edit" style={{background:'#8b5cf6', color:'white', border:'none', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', fontWeight:'600'}}>
                        ✎ Add Details
                      </button>
                    ) : (
                      <button onClick={() => handleNotifyCustomer(job)} className="btn-icon">📧 Ready</button>
                    )}

                    {/* BUTTON 2: Finish */}
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

// --- UNIFIED JOB MODAL (Handles CREATE and EDIT) ---
function JobModal({ job, products, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dueDate: '',
    productId: '', payMethod: 'Cash', advance: '', totalCost: ''
  });

  // Load Data if Editing
  useEffect(() => {
    if (job) {
      // Find matching product ID based on code if needed, or just set raw values
      const prod = products.find(p => p.code === job.productCode);
      setFormData({
        name: job.customerName || job.name || '',
        email: job.customerEmail || job.email || '',
        phone: job.customerPhone || job.phone || '',
        dueDate: job.dueDate || '',
        productId: prod ? prod.id : '',
        payMethod: job.payMethod || 'Cash',
        advance: job.advance || '',
        totalCost: job.totalCost || ''
      });
    }
  }, [job, products]);

  // AUTO-UPDATE PRICE when Product Changes
  useEffect(() => {
    if (formData.productId) {
      const prod = products.find(p => p.id === formData.productId);
      if (prod) {
        setFormData(prev => ({ ...prev, totalCost: prod.price }));
      }
    }
  }, [formData.productId, products]);

  const handleSubmit = async () => {
    if(!formData.name) return alert("Customer Name is required");
    
    // Calculate Math
    const total = Number(formData.totalCost || 0);
    const adv = Number(formData.advance || 0);
    const bal = total - adv;
    
    const selectedProduct = products.find(p => p.id === formData.productId);
    const pName = selectedProduct ? selectedProduct.name : "Custom";
    const pCode = selectedProduct ? selectedProduct.code : "CUST";

    if (job) {
      // --- UPDATE EXISTING JOB ---
      await updateDoc(doc(db, "jobs", job.id), {
        customerName: formData.name,
        customerEmail: formData.email,
        customerPhone: formData.phone,
        dueDate: formData.dueDate,
        productCode: pCode,
        productName: pName,
        totalCost: total,
        advance: adv,
        balance: bal,
        payMethod: formData.payMethod,
      });
      alert("Job Updated!");
    } else {
      // --- CREATE NEW JOB ---
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await t.get(counterRef);
        const newCount = (counterDoc.exists() ? counterDoc.data().current : 0) + 1;
        const newId = `SC-${String(newCount).padStart(4, '0')}`;
        t.set(counterRef, { current: newCount });

        t.set(doc(db, "jobs", newId), {
          customerName: formData.name,
          customerEmail: formData.email,
          customerPhone: formData.phone,
          dueDate: formData.dueDate,
          productCode: pCode,
          productName: pName,
          totalCost: total,
          advance: adv,
          balance: bal,
          payMethod: formData.payMethod,
          status: "Pending",
          createdAt: serverTimestamp()
        });
      });
      alert("Job Created!");
    }
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{job ? `Edit Job: ${job.id}` : "Create New Job"}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="form-row">
          <label>Customer Name</label>
          <input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} />
        </div>
        <div className="split-row">
          <div className="form-row">
            <label>Email</label>
            <input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} />
          </div>
          <div className="form-row">
            <label>Phone</label>
            <input value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} />
          </div>
        </div>

        <div className="form-row">
          <label>Select Product</label>
          <select value={formData.productId} onChange={e=>setFormData({...formData, productId:e.target.value})}>
            <option value="">-- Select Product --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </select>
        </div>

        <div className="split-row">
           <div className="form-row">
            <label>Due Date</label>
            <input type="date" value={formData.dueDate} onChange={e=>setFormData({...formData, dueDate:e.target.value})} />
          </div>
          <div className="form-row">
            <label>Total Amount (LKR)</label>
            {/* Auto-populated but editable */}
            <input type="number" value={formData.totalCost} onChange={e=>setFormData({...formData, totalCost:e.target.value})} />
          </div>
        </div>
        
        <label style={{fontWeight:'bold', display:'block', marginBottom:'5px'}}>Payment (Advance)</label>
        <div className="split-row">
          <div className="form-row">
            <select value={formData.payMethod} onChange={e=>setFormData({...formData, payMethod:e.target.value})}>
              <option>Cash</option><option>Card</option>
            </select>
          </div>
          <div className="form-row">
            <input type="number" placeholder="Amount Paid" value={formData.advance} onChange={e=>setFormData({...formData, advance:e.target.value})} />
          </div>
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={handleSubmit} className="btn-confirm">
            {job ? "Update Job" : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- PDF GENERATOR ---
const generatePDFBase64 = (job) => {
  const doc = new jsPDF();
  const cName = job.customerName || job.name || "Customer";
  const total = Number(job.totalCost || 0);
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
  
  doc.text(`${job.productName || "Service"}`, 20, y);
  doc.text(`${total}.00`, 160, y);
  
  y += 20;
  doc.text(`Paid:`, 100, y);
  doc.text(`${job.balance === 0 ? total : paid}.00`, 160, y);
  
  doc.setFont(undefined, 'bold');
  y += 15;
  doc.text("TOTAL:", 100, y);
  doc.text(`${total}.00`, 160, y);

  return btoa(doc.output()); 
};