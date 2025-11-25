import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, query, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { jsPDF } from "jspdf";
import ProductManager from './ProductManager';

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla",
  phone: "077 731 1230",
  logoUrl: "/LOGO.png"
};

export default function AdminDashboard() {
  const [userRole, setUserRole] = useState(null); 
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  
  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);

  // Stats
  const [stats, setStats] = useState({ totalJobs: 0, cashIncome: 0, cardIncome: 0, dueBalance: 0 });

  // --- 1. DATA FETCHING ---
  useEffect(() => {
    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map(d => ({...d.data(), id: d.id})));
    });

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
  
  const handleNewJob = () => { setEditingJob(null); setShowModal(true); };
  const handleEditJob = (job) => { setEditingJob(job); setShowModal(true); };

  const handleDeleteJob = async (id) => {
    if(confirm("Are you sure you want to DELETE this job permanently?")) {
      await deleteDoc(doc(db, "jobs", id));
    }
  };

  const handleNotifyReady = async (job) => {
    if(!confirm("Notify customer that item is READY?")) return;
    try {
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({ type: 'READY_NOTIFY', name: job.customerName, email: job.customerEmail, jobId: job.id })
      });
      alert("Notification Sent!");
    } catch(e) { alert("Failed"); }
  };

  const handleCompleteJob = async (job) => {
    if(job.balance > 0 && !confirm(`Customer owes LKR ${job.balance}. Mark as Paid & Completed?`)) return;
    
    await updateDoc(doc(db, "jobs", job.id), {
      status: "Completed",
      balance: 0, 
      completedAt: serverTimestamp()
    });
    alert("Job Marked as Completed!");
  };

  // Filter Logic
  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    return job.status.toLowerCase() === filter;
  });

  // Count Logic
  const pendingCount = jobs.filter(j => j.status === 'Pending').length;
  const completedCount = jobs.filter(j => j.status === 'Completed').length;

  // --- 3. UI ---
  if (!userRole) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <img src={COMPANY.logoUrl} className="logo" alt="logo"/>
          <h2>Studio Tracker V2.0</h2>
          <button onClick={() => setUserRole('admin')} className="btn-admin">Admin Login</button>
          <button onClick={() => setUserRole('staff')} className="btn-staff">Staff View</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container dashboard-container">
      <div className="header-v2">
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <img src={COMPANY.logoUrl} className="logo-small" />
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

      {view === 'products' && <ProductManager onClose={() => setView('dashboard')} />}
      
      {showModal && (
        <JobModal 
          job={editingJob} 
          products={products} 
          onClose={() => setShowModal(false)} 
        />
      )}

      {userRole === 'admin' && (
        <div className="stats-grid">
          <div className="stat-card"><h3>Total Jobs</h3><p>{stats.totalJobs}</p></div>
          <div className="stat-card"><h3>Cash Income</h3><p>LKR {stats.cashIncome}</p></div>
          <div className="stat-card"><h3>Card Income</h3><p>LKR {stats.cardIncome}</p></div>
          <div className="stat-card highlight"><h3>Due Balance</h3><p>LKR {stats.dueBalance}</p></div>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="filter-bar">
        <button className={`filter-btn ${filter==='all'?'active':''}`} onClick={()=>setFilter('all')}>All ({jobs.length})</button>
        <button className={`filter-btn ${filter==='pending'?'active':''}`} onClick={()=>setFilter('pending')}>Pending ({pendingCount})</button>
        <button className={`filter-btn ${filter==='completed'?'active':''}`} onClick={()=>setFilter('completed')}>Completed ({completedCount})</button>
      </div>

      <div className="job-list-v2">
        {filteredJobs.map(job => {
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
                  {isMissingDetails ? <span style={{color:'red'}}>⚠ Waiting for Details</span> : `${job.productName} (${job.productCode})`}
                </div>
                <div className="job-finance">
                  Total: {job.totalCost || 0} | Paid: {job.advance || 0} | 
                  <span style={{color: job.balance > 0 ? 'red' : 'green', fontWeight:'bold', marginLeft:'5px'}}>
                    Due: {job.balance || 0}
                  </span>
                </div>
              </div>

              <div className="job-actions-v2">
                {/* ALWAYS SHOW EDIT BUTTON FOR PENDING JOBS */}
                {job.status !== "Completed" && (
                  <>
                    <button onClick={() => handleEditJob(job)} className="btn-edit" style={{background:'#8b5cf6', color:'white', border:'none', padding:'8px 12px', borderRadius:'8px', cursor:'pointer', fontWeight:'600'}}>
                      {isMissingDetails ? "Add Details" : "Edit Details"}
                    </button>
                    
                    {!isMissingDetails && (
                       <button onClick={() => handleNotifyCustomer(job)} className="btn-icon">📧 Ready</button>
                    )}

                    {userRole === 'admin' && (
                      <button onClick={() => handleCompleteJob(job)} className="btn-save">Finish</button>
                    )}
                  </>
                )}
                
                {/* DELETE BUTTON */}
                {userRole === 'admin' && (
                  <button onClick={() => handleDeleteJob(job.id)} className="btn-icon-del" title="Delete">🗑️</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- MODAL (CREATE / UPDATE) ---
function JobModal({ job, products, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dueDate: '',
    productId: '', payMethod: 'Cash', advance: '', totalCost: ''
  });

  useEffect(() => {
    if (job) {
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

  // Auto-Price
  useEffect(() => {
    if (formData.productId) {
      const prod = products.find(p => p.id === formData.productId);
      if (prod) setFormData(prev => ({ ...prev, totalCost: prod.price }));
    }
  }, [formData.productId]);

  const handleSubmit = async () => {
    if(!formData.name) return alert("Name required");
    
    // Default to TODAY if date is empty
    const finalDueDate = formData.dueDate || new Date().toISOString().split('T')[0];

    const total = Number(formData.totalCost || 0);
    const adv = Number(formData.advance || 0);
    const bal = total - adv;
    
    const selectedProduct = products.find(p => p.id === formData.productId);
    const pName = selectedProduct ? selectedProduct.name : "Custom";
    const pCode = selectedProduct ? selectedProduct.code : "CUST";

    // Prepare Job Data Object
    const jobData = {
      customerName: formData.name,
      customerEmail: formData.email,
      customerPhone: formData.phone,
      dueDate: finalDueDate,
      productCode: pCode,
      productName: pName,
      totalCost: total,
      advance: adv,
      balance: bal,
      payMethod: formData.payMethod,
    };

    let updatedJobId = job ? job.id : null;

    if (job) {
      // UPDATE
      await updateDoc(doc(db, "jobs", job.id), jobData);
      updatedJobId = job.id;
      alert("Job Updated!");
    } else {
      // CREATE
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await t.get(counterRef);
        const newCount = (counterDoc.exists() ? counterDoc.data().current : 0) + 1;
        updatedJobId = `SC-${String(newCount).padStart(4, '0')}`;
        t.set(counterRef, { current: newCount });
        t.set(doc(db, "jobs", updatedJobId), {
          ...jobData,
          status: "Pending",
          createdAt: serverTimestamp()
        });
      });
      alert("Job Created!");
    }

    // --- SEND RECEIPT EMAIL NOW ---
    // Generate the PDF
    const pdfBase64 = await generatePDFBase64({ ...jobData, id: updatedJobId });
    
    // Send Email
    fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({
        type: 'JOB_UPDATED', // New Email Type
        name: formData.name,
        email: formData.email,
        jobId: updatedJobId,
        pdfBase64: pdfBase64
      })
    });

    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{job ? `Edit Job: ${job.id}` : "Create New Job"}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="form-row"><label>Customer Name</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} /></div>
        <div className="split-row">
          <div className="form-row"><label>Email</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} /></div>
          <div className="form-row"><label>Phone</label><input value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} /></div>
        </div>

        <div className="form-row">
          <label>Select Product</label>
          <select value={formData.productId} onChange={e=>setFormData({...formData, productId:e.target.value})}>
            <option value="">-- Select --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
          </select>
        </div>

        <div className="split-row">
           <div className="form-row"><label>Due Date</label><input type="date" value={formData.dueDate} onChange={e=>setFormData({...formData, dueDate:e.target.value})} /></div>
           <div className="form-row"><label>Total (LKR)</label><input type="number" value={formData.totalCost} onChange={e=>setFormData({...formData, totalCost:e.target.value})} /></div>
        </div>
        
        <div className="split-row">
          <div className="form-row">
            <label>Payment Method</label>
            <select value={formData.payMethod} onChange={e=>setFormData({...formData, payMethod:e.target.value})}><option>Cash</option><option>Card</option></select>
          </div>
          <div className="form-row">
            <label>Advance Amount</label>
            <input type="number" value={formData.advance} onChange={e=>setFormData({...formData, advance:e.target.value})} />
          </div>
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="btn-cancel">Cancel</button>
          <button onClick={handleSubmit} className="btn-confirm">{job ? "Update & Email" : "Create & Email"}</button>
        </div>
      </div>
    </div>
  );
}

// --- DETAILED PDF GENERATOR WITH LOGO ---
const generatePDFBase64 = async (job) => {
  const doc = new jsPDF();
  
  // 1. Load Logo Helper
  const getBase64ImageFromURL = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute("crossOrigin", "anonymous");
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = error => reject(error);
      img.src = url;
    });
  };

  try {
    const logoBase64 = await getBase64ImageFromURL(COMPANY.logoUrl);
    doc.addImage(logoBase64, 'PNG', 15, 10, 40, 15); // x, y, w, h
  } catch(e) {
    // If logo fails, fallback to text
    doc.setFontSize(22);
    doc.text("STUDIO CLICK", 15, 20);
  }

  // Header Info
  doc.setFontSize(10);
  doc.text(COMPANY.address, 150, 15, { align: 'right' });
  doc.text(COMPANY.phone, 150, 20, { align: 'right' });
  
  doc.line(15, 35, 195, 35); // Divider

  // Invoice Title
  doc.setFontSize(16);
  doc.text("OFFICIAL RECEIPT", 105, 50, null, null, "center");

  // Customer & Job Details (Grid Layout)
  doc.setFontSize(11);
  doc.setDrawColor(200);
  
  // Box 1: Customer
  doc.rect(15, 60, 90, 30);
  doc.text("BILL TO:", 20, 68);
  doc.setFont(undefined, 'bold');
  doc.text(job.customerName || "Customer", 20, 75);
  doc.setFont(undefined, 'normal');
  doc.text(job.customerPhone || "", 20, 82);

  // Box 2: Job Info
  doc.rect(105, 60, 90, 30);
  doc.text(`RECEIPT #: ${job.id}`, 110, 68);
  doc.text(`DATE: ${new Date().toLocaleDateString()}`, 110, 75);
  doc.text(`DUE DATE: ${job.dueDate || "N/A"}`, 110, 82);

  // Table Header
  let y = 105;
  doc.setFillColor(240, 240, 240);
  doc.rect(15, y, 180, 10, "F");
  doc.setFont(undefined, 'bold');
  doc.text("DESCRIPTION", 20, y+7);
  doc.text("PRICE (LKR)", 160, y+7);

  // Table Body
  y += 20;
  doc.setFont(undefined, 'normal');
  doc.text(job.productName || "Service", 20, y);
  doc.text(`${Number(job.totalCost).toFixed(2)}`, 160, y);
  
  doc.line(15, y+5, 195, y+5);

  // Totals Area
  y += 15;
  doc.text("Sub Total:", 120, y);
  doc.text(`${Number(job.totalCost).toFixed(2)}`, 160, y);
  
  y += 10;
  doc.text("Advance Paid:", 120, y);
  doc.text(`- ${Number(job.advance).toFixed(2)}`, 160, y);

  y += 15;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(14);
  
  const balance = Number(job.balance) > 0 ? Number(job.balance) : 0;
  
  if (balance === 0) {
    doc.setTextColor(0, 150, 0); // Green
    doc.text("FULLY PAID", 120, y);
  } else {
    doc.setTextColor(200, 0, 0); // Red
    doc.text("BALANCE DUE:", 120, y);
    doc.text(`${balance.toFixed(2)}`, 165, y);
  }

  // Footer
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont(undefined, 'italic');
  doc.text("Thank you for your business!", 105, 280, null, null, "center");

  return doc.output('datauristring').split(',')[1]; // Return Base64
};