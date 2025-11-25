import { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, doc, updateDoc, deleteDoc, 
  serverTimestamp, runTransaction, getDoc 
} from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';
import { jsPDF } from "jspdf";
import ProductManager from './ProductManager';

const COMPANY = {
  name: "Studio Click",
  address: "336 Kaduwela Road, Battaramulla",
  phone: "077 731 1230",
  logoUrl: "/LOGO.png"
};

export default function AdminDashboard() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [view, setView] = useState('dashboard');
  const [jobs, setJobs] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState(null);

  const [stats, setStats] = useState({ totalJobs: 0, cashIncome: 0, cardIncome: 0, dueBalance: 0 });

  // --- 1. AUTH ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          setUser(currentUser);
          setUserRole(userDoc.data().role); 
        } else {
          const role = currentUser.email.includes('admin') ? 'admin' : 'staff';
          setUser(currentUser);
          setUserRole(role);
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // --- 2. DATA ---
  useEffect(() => {
    if (!user) return;

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

  // --- 3. HANDLERS ---

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try { await signInWithEmailAndPassword(auth, loginData.email, loginData.password); } catch (error) { setLoginError("Invalid Email or Password"); }
  };

  const handleLogout = () => signOut(auth);
  const handleNewJob = () => { setEditingJob(null); setShowModal(true); };
  const handleEditJob = (job) => { setEditingJob(job); setShowModal(true); };

  const handleDeleteJob = async (id) => {
    if(confirm("Permanently delete this job?")) await deleteDoc(doc(db, "jobs", id));
  };

  const handleMarkReady = async (job) => {
    if(!confirm("Mark as DONE and Notify Customer?")) return;
    try {
      await updateDoc(doc(db, "jobs", job.id), { status: "Ready" });
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({ type: 'READY_NOTIFY', name: job.customerName || job.name, email: job.customerEmail || job.email, jobId: job.id })
      });
      alert("Marked Ready & Email Sent!");
    } catch(e) { alert("Saved, but Email failed."); }
  };

  const handleCompleteJob = async (job) => {
    if(job.balance > 0 && !confirm(`Collect LKR ${job.balance}. Mark Paid?`)) return;
    const pdfBase64 = await generatePDFBase64(job);
    await updateDoc(doc(db, "jobs", job.id), { status: "Completed", balance: 0, completedAt: serverTimestamp() });
    fetch('/.netlify/functions/sendReceipt', {
      method: 'POST',
      body: JSON.stringify({ type: 'RECEIPT', name: job.customerName || job.name, email: job.customerEmail || job.email, jobId: job.id, pdfBase64 })
    });
    alert("Job Closed!");
  };

  // --- SEARCH & FILTER ---
  const filteredJobs = jobs.filter(job => {
    const statusMatch = filter === 'all' ? true : job.status.toLowerCase() === filter;
    const term = searchTerm.toLowerCase();
    const searchMatch = 
      (job.id || '').toLowerCase().includes(term) ||
      (job.customerName || job.name || '').toLowerCase().includes(term) ||
      (job.customerPhone || job.phone || '').toLowerCase().includes(term) ||
      (job.description || '').toLowerCase().includes(term);
    return statusMatch && searchMatch;
  });

  const pendingCount = jobs.filter(j => j.status === 'Pending').length;
  const readyCount = jobs.filter(j => j.status === 'Ready').length;
  const completedCount = jobs.filter(j => j.status === 'Completed').length;

  // --- UI ---

  if (loading) return <div className="login-screen">Loading...</div>;

  if (!user) {
    return (
      <div className="login-screen">
        <form className="login-box" onSubmit={handleLogin}>
          <img src={COMPANY.logoUrl} className="logo" alt="logo"/>
          <h2>Studio Login</h2>
          <input className="login-input" type="email" placeholder="Email" required value={loginData.email} onChange={e=>setLoginData({...loginData, email:e.target.value})} />
          <input className="login-input" type="password" placeholder="Password" required value={loginData.password} onChange={e=>setLoginData({...loginData, password:e.target.value})} />
          {loginError && <p style={{color:'red', fontSize:'0.9rem'}}>{loginError}</p>}
          <button className="btn-login">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="container dashboard-container">
      <div className="header-v2">
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
          <img src={COMPANY.logoUrl} className="logo-small" />
          <div><h2 style={{margin:0}}>Studio Dashboard</h2><span className="badge">{userRole ? userRole.toUpperCase() : 'USER'}</span></div>
        </div>
        <div style={{display:'flex', gap:'10px'}}>
          {userRole === 'admin' && <><button onClick={handleNewJob} className="btn-new">+ New Job</button><button onClick={() => setView('products')} className="btn-secondary">Products</button></>}
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </div>

      {view === 'products' && <ProductManager onClose={() => setView('dashboard')} />}
      {showModal && <JobModal job={editingJob} products={products} onClose={() => setShowModal(false)} />}

      {userRole === 'admin' && (
        <div className="stats-grid">
          <div className="stat-card"><h3>Total Jobs</h3><p>{stats.totalJobs}</p></div>
          <div className="stat-card"><h3>Cash Income</h3><p>LKR {stats.cashIncome}</p></div>
          <div className="stat-card"><h3>Card Income</h3><p>LKR {stats.cardIncome}</p></div>
          <div className="stat-card highlight"><h3>Due Balance</h3><p>LKR {stats.dueBalance}</p></div>
        </div>
      )}

      <div className="search-wrapper"><input className="search-input" placeholder="Search by Name, ID, Phone or Description..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>

      <div className="filter-bar">
        <button className={`filter-btn ${filter==='all'?'active-all':''}`} onClick={()=>setFilter('all')}>All ({jobs.length})</button>
        <button className={`filter-btn ${filter==='pending'?'active-pending':''}`} onClick={()=>setFilter('pending')}>Pending ({pendingCount})</button>
        <button className={`filter-btn ${filter==='ready'?'active-ready':''}`} onClick={()=>setFilter('ready')}>Ready ({readyCount})</button>
        <button className={`filter-btn ${filter==='completed'?'active-completed':''}`} onClick={()=>setFilter('completed')}>Completed ({completedCount})</button>
      </div>

      <div className="job-list-v2">
        {filteredJobs.map(job => {
          const isMissingDetails = !job.productCode || !job.totalCost; 
          const name = job.customerName || job.name; 
          
          return (
            <div key={job.id} className={`job-row-v2 ${job.status}`}>
              <div className="job-date"><span className="date-box">{job.dueDate ? new Date(job.dueDate).getDate() : "--"} <br/><small>{job.dueDate ? new Date(job.dueDate).toLocaleString('default', { month: 'short' }) : ""}</small></span></div>
              <div className="job-info">
                <div className="job-title">
                  <strong>{job.id}</strong> - {name}
                  {job.status === "Pending" && <span className="badge-pending">Processing</span>}
                  {job.status === "Ready" && <span className="badge-ready">Ready</span>}
                  {job.status === "Completed" && <span className="badge-completed">Done</span>}
                </div>
                <div className="job-product">{isMissingDetails ? <span style={{color:'red'}}>⚠ Details Needed</span> : `${job.productName} (${job.productCode})`}</div>
                {job.description && <div style={{fontSize:'0.85rem', color:'#666', fontStyle:'italic', marginBottom:'5px'}}>"{job.description}"</div>}
                <div className="job-finance">Total: {job.totalCost || 0} | Paid: {job.advance || 0} | <span style={{color: job.balance > 0 ? 'red' : 'green', fontWeight:'bold', marginLeft:'5px'}}>Due: {job.balance || 0}</span></div>
              </div>
              <div className="job-actions-v2">
                {userRole === 'admin' && <button onClick={() => handleEditJob(job)} className="btn-edit">{isMissingDetails ? "Add Details" : "Edit"}</button>}
                {!isMissingDetails && job.status === "Pending" && <button onClick={() => handleMarkReady(job)} className="btn-ready">✔ Mark Done</button>}
                {userRole === 'admin' && job.status !== "Completed" && !isMissingDetails && <button onClick={() => handleCompleteJob(job)} className="btn-save">Finish & Pay</button>}
                {userRole === 'admin' && <button onClick={() => handleDeleteJob(job.id)} className="btn-icon-del" title="Delete">🗑️</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- MODAL (UPDATED with 2 BUTTONS) ---
function JobModal({ job, products, onClose }) {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', dueDate: '',
    productId: '', payMethod: 'Cash', advance: '', totalCost: '', description: ''
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
        totalCost: job.totalCost || '',
        description: job.description || ''
      });
    }
  }, [job, products]);

  useEffect(() => {
    if (formData.productId) {
      const prod = products.find(p => p.id === formData.productId);
      if (prod) {
        setFormData(prev => ({
          ...prev,
          totalCost: prod.price,
          description: prev.description ? prev.description : (prod.description || '')
        }));
      }
    }
  }, [formData.productId]);

  // --- MAIN SAVE LOGIC ---
  const saveJobLogic = async (sendEmail) => {
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
      description: formData.description, 
      totalCost: total,
      advance: adv,
      balance: bal,
      payMethod: formData.payMethod,
    };

    let updatedJobId = job ? job.id : null;

    if (job) {
      // UPDATE EXISTING
      await updateDoc(doc(db, "jobs", job.id), jobData);
      updatedJobId = job.id;
    } else {
      // CREATE NEW
      await runTransaction(db, async (t) => {
        const counterRef = doc(db, "counters", "jobCounter");
        const counterDoc = await t.get(counterRef);
        const newCount = (counterDoc.exists() ? counterDoc.data().current : 0) + 1;
        updatedJobId = `SC-${String(newCount).padStart(4, '0')}`;
        t.set(counterRef, { current: newCount });
        t.set(doc(db, "jobs", updatedJobId), { ...jobData, status: "Pending", createdAt: serverTimestamp() });
      });
    }

    // EMAIL LOGIC (Only if requested)
    if (sendEmail) {
      const pdfBase64 = await generatePDFBase64({ ...jobData, id: updatedJobId });
      await fetch('/.netlify/functions/sendReceipt', {
        method: 'POST',
        body: JSON.stringify({
          type: 'JOB_UPDATED',
          name: formData.name,
          email: formData.email,
          jobId: updatedJobId,
          pdfBase64: pdfBase64
        })
      });
      alert("Saved & Email Sent!");
    } else {
      alert("Saved successfully!");
    }

    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header"><h2>{job ? `Edit Job: ${job.id}` : "Create New Job"}</h2><button className="close-btn" onClick={onClose}>&times;</button></div>
        <div className="form-row"><label>Customer Name</label><input value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} /></div>
        <div className="split-row">
          <div className="form-row"><label>Email</label><input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} /></div>
          <div className="form-row"><label>Phone</label><input value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} /></div>
        </div>
        <div className="form-row"><label>Select Product</label><select value={formData.productId} onChange={e=>setFormData({...formData, productId:e.target.value})}><option value="">-- Select --</option>{products.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}</select></div>
        <div className="form-row"><label>Description / Notes</label><textarea rows="2" value={formData.description} onChange={e=>setFormData({...formData, description:e.target.value})} /></div>
        <div className="split-row">
           <div className="form-row"><label>Due Date</label><input type="date" value={formData.dueDate} onChange={e=>setFormData({...formData, dueDate:e.target.value})} /></div>
           <div className="form-row"><label>Total (LKR)</label><input type="number" value={formData.totalCost} onChange={e=>setFormData({...formData, totalCost:e.target.value})} /></div>
        </div>
        <div className="split-row">
          <div className="form-row"><label>Payment Method</label><select value={formData.payMethod} onChange={e=>setFormData({...formData, payMethod:e.target.value})}><option>Cash</option><option>Card</option></select></div>
          <div className="form-row"><label>Advance Amount</label><input type="number" value={formData.advance} onChange={e=>setFormData({...formData, advance:e.target.value})} /></div>
        </div>
        
        <div className="modal-actions">
          {/* BUTTON 1: Save Only */}
          <button onClick={() => saveJobLogic(false)} style={{background:'#6b7280', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'600', cursor:'pointer', marginRight:'10px'}}>
            Save Changes
          </button>
          
          {/* BUTTON 2: Save & Email */}
          <button onClick={() => saveJobLogic(true)} className="btn-confirm">
            Save & Send Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

const generatePDFBase64 = async (job) => {
  const doc = new jsPDF();
  const getBase64ImageFromURL = (url) => new Promise((resolve, reject) => { const img = new Image(); img.setAttribute("crossOrigin", "anonymous"); img.onload = () => { const c = document.createElement("canvas"); c.width=img.width; c.height=img.height; c.getContext("2d").drawImage(img,0,0); resolve(c.toDataURL("image/png")); }; img.onerror=e=>reject(e); img.src=url; });
  try { const logo = await getBase64ImageFromURL(COMPANY.logoUrl); doc.addImage(logo, 'PNG', 15, 10, 40, 15); } catch(e) { doc.setFontSize(22); doc.text("STUDIO CLICK", 15, 20); }
  doc.setFontSize(10); doc.text(COMPANY.address, 150, 15, { align: 'right' }); doc.text(COMPANY.phone, 150, 20, { align: 'right' }); doc.line(15, 35, 195, 35);
  doc.setFontSize(16); doc.text("OFFICIAL RECEIPT", 105, 50, null, null, "center");
  doc.setFontSize(11); doc.setDrawColor(200); doc.rect(15, 60, 90, 30); doc.text("BILL TO:", 20, 68); doc.setFont(undefined, 'bold'); doc.text(job.customerName || "Customer", 20, 75); doc.setFont(undefined, 'normal'); doc.text(job.customerPhone || "", 20, 82);
  doc.rect(105, 60, 90, 30); doc.text(`RECEIPT #: ${job.id}`, 110, 68); doc.text(`DATE: ${new Date().toLocaleDateString()}`, 110, 75); doc.text(`DUE DATE: ${job.dueDate || "N/A"}`, 110, 82);
  let y = 105; doc.setFillColor(240, 240, 240); doc.rect(15, y, 180, 10, "F"); doc.setFont(undefined, 'bold'); doc.text("DESCRIPTION", 20, y+7); doc.text("PRICE (LKR)", 160, y+7);
  y += 20; doc.setFont(undefined, 'normal'); doc.text(job.productName || "Service", 20, y); doc.text(`${Number(job.totalCost).toFixed(2)}`, 160, y);
  if(job.description) { y += 7; doc.setFontSize(9); doc.setTextColor(100); doc.text(`Note: ${job.description}`, 20, y); doc.setFontSize(11); doc.setTextColor(0); y += 3; }
  doc.line(15, y+5, 195, y+5);
  y += 15; doc.text("Sub Total:", 120, y); doc.text(`${Number(job.totalCost).toFixed(2)}`, 160, y);
  y += 10; doc.text("Advance Paid:", 120, y); doc.text(`- ${Number(job.advance).toFixed(2)}`, 160, y);
  y += 15; doc.setFont(undefined, 'bold'); doc.setFontSize(14);
  const bal = Number(job.balance) > 0 ? Number(job.balance) : 0;
  if (bal === 0) { doc.setTextColor(0, 150, 0); doc.text("FULLY PAID", 120, y); } else { doc.setTextColor(200, 0, 0); doc.text("BALANCE DUE:", 120, y); doc.text(`${bal.toFixed(2)}`, 165, y); }
  doc.setTextColor(0); doc.setFontSize(10); doc.setFont(undefined, 'italic'); doc.text("Thank you for your business!", 105, 280, null, null, "center");
  return doc.output('datauristring').split(',')[1];
};