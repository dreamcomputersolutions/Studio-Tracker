import { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc, 
  serverTimestamp, query, runTransaction 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'; // Auth Imports
import { db, auth } from './firebase'; // Import auth
import { jsPDF } from "jspdf";
import ProductManager from './ProductManager';

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla",
  phone: "077 731 1230",
  logoUrl: "/LOGO.png"
};

export default function AdminDashboard() {
  // Login State
  const [user, setUser] = useState(null); // Firebase User
  const [userRole, setUserRole] = useState(null); // 'admin' or 'staff'
  const [loading, setLoading] = useState(true);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');

  // App State
  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [stats, setStats] = useState({ totalJobs: 0, cashIncome: 0, cardIncome: 0, dueBalance: 0 });

  // --- 1. AUTH CHECKER (Keeps you logged in) ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        // 1. User is logged in, fetch their Role from Firestore
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setUser(currentUser);
          setUserRole(userDoc.data().role); // 'admin' or 'staff'
        } else {
          alert("User exists but has no role assigned in Database!");
          await signOut(auth);
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    if (!user) return; // Don't fetch if not logged in

    const unsubProd = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map(d => ({...d.data(), id: d.id})));
    });

    const unsubJobs = onSnapshot(collection(db, "jobs"), (snap) => {
      let data = snap.docs.map(d => ({...d.data(), id: d.id}));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setJobs(data);

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
  }, [user]);

  // --- 3. ACTIONS ---
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginData.email, loginData.password);
      // onAuthStateChanged will handle the rest
    } catch (error) {
      console.error(error);
      setLoginError("Incorrect Email or Password");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // ... (Keep existing handlers: NewJob, EditJob, DeleteJob, Notify, Complete) ...
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
    
    // Generate PDF
    const pdfBase64 = await generatePDFBase64(job);

    await updateDoc(doc(db, "jobs", job.id), {
      status: "Completed",
      balance: 0, 
      completedAt: serverTimestamp()
    });

    // Send Final Receipt
    fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({ type: 'RECEIPT', name: job.customerName, email: job.customerEmail, jobId: job.id, pdfBase64 })
    });

    alert("Job Marked as Completed!");
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    return job.status.toLowerCase() === filter;
  });

  const pendingCount = jobs.filter(j => j.status === 'Pending').length;
  const completedCount = jobs.filter(j => j.status === 'Completed').length;

  // --- 4. LOADING & LOGIN UI ---
  
  if (loading) return <div className="login-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="login-screen">
        <form className="login-box" onSubmit={handleLogin}>
          <img src={COMPANY.logoUrl} className="logo" alt="logo"/>
          <h2>Studio Tracker Login</h2>
          
          <input 
            className="login-input" 
            type="email"
            placeholder="Email (e.g. admin@studio.com)" 
            value={loginData.email}
            onChange={e=>setLoginData({...loginData, email:e.target.value})}
            required
          />
          <input 
            className="login-input" 
            type="password"
            placeholder="Password" 
            value={loginData.password}
            onChange={e=>setLoginData({...loginData, password:e.target.value})}
            required
          />
          
          {loginError && <p style={{color:'red', marginBottom:'10px'}}>{loginError}</p>}
          
          <button type="submit" className="btn-login">Login</button>
        </form>
      </div>
    );
  }

  // --- 5. MAIN DASHBOARD UI ---
  return (
    <div className="container dashboard-container">
      <div className="header-v2">
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <img src={COMPANY.logoUrl} className="logo-small" />
          <div>
            <h2 style={{margin:0}}>Studio Dashboard</h2>
            <span className="badge">{userRole ? userRole.toUpperCase() : 'USER'}</span>
          </div>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {userRole === 'admin' && (
            <>
              <button onClick={handleNewJob} className="btn-new">+ New Job</button>
              <button onClick={() => setView('products')} className="btn-secondary">Products</button>
            </>
          )}
          <button onClick={handleLogout} className="btn-logout">Logout</button>
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
        <button className={`filter-btn ${filter==='all'?'active-all':''}`} onClick={()=>setFilter('all')}>All ({jobs.length})</button>
        <button className={`filter-btn ${filter==='pending'?'active-pending':''}`} onClick={()=>setFilter('pending')}>Pending ({pendingCount})</button>
        <button className={`filter-btn ${filter==='completed'?'active-completed':''}`} onClick={()=>setFilter('completed')}>Completed ({completedCount})</button>
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
                {/* 1. EDIT BUTTON */}
                <button onClick={() => handleEditJob(job)} className="btn-edit">
                  {isMissingDetails ? "Add Details" : "Edit/Modify"}
                </button>
                
                {/* 2. NOTIFY BUTTON */}
                {!isMissingDetails && job.status !== "Completed" && (
                   <button onClick={() => handleNotifyReady(job)} className="btn-icon">📧 Ready</button>
                )}

                {/* 3. FINISH BUTTON */}
                {userRole === 'admin' && job.status !== "Completed" && !isMissingDetails && (
                  <button onClick={() => handleCompleteJob(job)} className="btn-save">Finish</button>
                )}
                
                {/* 4. DELETE BUTTON */}
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

// ... (KEEP THE JOBMODAL AND GENERATEPDF FUNCTION AS THEY WERE, JUST PASTE THEM BELOW HERE) ...
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

  useEffect(() => {
    if (formData.productId) {
      const prod = products.find(p => p.id === formData.productId);
      if (prod) setFormData(prev => ({ ...prev, totalCost: prod.price }));
    }
  }, [formData.productId]);

  const handleSubmit = async () => {
    if(!formData.name) return alert("Name required");
    
    const finalDueDate = formData.dueDate || new Date().toISOString().split('T')[0];
    const total = Number(formData.totalCost || 0);
    const adv = Number(formData.advance || 0);
    const bal = total - adv;
    
    const selectedProduct = products.find(p => p.id === formData.productId);
    const pName = selectedProduct ? selectedProduct.name : "Custom";
    const pCode = selectedProduct ? selectedProduct.code : "CUST";

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
      await updateDoc(doc(db, "jobs", job.id), jobData);
      updatedJobId = job.id;
      alert("Job Updated!");
    } else {
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

    const pdfBase64 = await generatePDFBase64({ ...jobData, id: updatedJobId });
    
    fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({
        type: 'JOB_UPDATED',
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

// --- PDF GENERATOR ---
const generatePDFBase64 = async (job) => {
  const doc = new jsPDF();
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
    doc.addImage(logoBase64, 'PNG', 15, 10, 40, 15);
  } catch(e) { doc.setFontSize(22); doc.text("STUDIO CLICK", 15, 20); }

  doc.setFontSize(10);
  doc.text(COMPANY.address, 150, 15, { align: 'right' });
  doc.text(COMPANY.phone, 150, 20, { align: 'right' });
  doc.line(15, 35, 195, 35);

  doc.setFontSize(16);
  doc.text("OFFICIAL RECEIPT", 105, 50, null, null, "center");

  doc.setFontSize(11);
  doc.setDrawColor(200);
  doc.rect(15, 60, 90, 30);
  doc.text("BILL TO:", 20, 68);
  doc.setFont(undefined, 'bold');
  doc.text(job.customerName || "Customer", 20, 75);
  doc.setFont(undefined, 'normal');
  doc.text(job.customerPhone || "", 20, 82);

  doc.rect(105, 60, 90, 30);
  doc.text(`RECEIPT #: ${job.id}`, 110, 68);
  doc.text(`DATE: ${new Date().toLocaleDateString()}`, 110, 75);
  doc.text(`DUE DATE: ${job.dueDate || "N/A"}`, 110, 82);

  let y = 105;
  doc.setFillColor(240, 240, 240);
  doc.rect(15, y, 180, 10, "F");
  doc.setFont(undefined, 'bold');
  doc.text("DESCRIPTION", 20, y+7);
  doc.text("PRICE (LKR)", 160, y+7);

  y += 20;
  doc.setFont(undefined, 'normal');
  doc.text(job.productName || "Service", 20, y);
  doc.text(`${Number(job.totalCost).toFixed(2)}`, 160, y);
  doc.line(15, y+5, 195, y+5);

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
    doc.setTextColor(0, 150, 0);
    doc.text("FULLY PAID", 120, y);
  } else {
    doc.setTextColor(200, 0, 0);
    doc.text("BALANCE DUE:", 120, y);
    doc.text(`${balance.toFixed(2)}`, 165, y);
  }

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont(undefined, 'italic');
  doc.text("Thank you for your business!", 105, 280, null, null, "center");

  return doc.output('datauristring').split(',')[1];
};