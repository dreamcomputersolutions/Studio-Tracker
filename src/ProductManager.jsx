import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, onSnapshot, doc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export default function ProductManager({ onClose }) {
  const [products, setProducts] = useState([]);
  const [newItem, setNewItem] = useState({ code: '', name: '', price: '', description: '' });

  // Load Products
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("code"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return unsubscribe;
  }, []);

  const handleAdd = async () => {
    if(!newItem.code || !newItem.name || !newItem.price) return alert("Fill Code, Name and Price");

    // Duplicate Check
    const isDuplicate = products.some(p => p.code.toLowerCase() === newItem.code.trim().toLowerCase());
    if (isDuplicate) return alert(`Product Code "${newItem.code}" exists!`);

    await addDoc(collection(db, "products"), {
      ...newItem,
      code: newItem.code.trim().toUpperCase()
    });
    
    setNewItem({ code: '', name: '', price: '', description: '' });
  };

  const handleDelete = async (id) => {
    if(confirm("Delete this product?")) await deleteDoc(doc(db, "products", id));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* ATTRACTIVE HEADER */}
        <div className="pm-header">
          <h2 style={{margin:0, color:'#333'}}>Product Manager</h2>
          <button onClick={onClose} className="btn-close-fancy">
            <span>&times;</span> Close
          </button>
        </div>

        {/* ADD FORM */}
        <div className="product-form">
          <div style={{display:'flex', gap:'10px'}}>
            <input 
              placeholder="Code (P01)" 
              value={newItem.code} 
              onChange={e=>setNewItem({...newItem, code:e.target.value})} 
              style={{width:'100px', padding:'10px', border:'1px solid #ddd', borderRadius:'6px'}} 
            />
            <input 
              placeholder="Service Name" 
              value={newItem.name} 
              onChange={e=>setNewItem({...newItem, name:e.target.value})} 
              style={{flex:1, padding:'10px', border:'1px solid #ddd', borderRadius:'6px'}}
            />
            <input 
              placeholder="Price" 
              type="number" 
              value={newItem.price} 
              onChange={e=>setNewItem({...newItem, price:e.target.value})} 
              style={{width:'100px', padding:'10px', border:'1px solid #ddd', borderRadius:'6px'}} 
            />
          </div>
          <textarea 
            placeholder="Default Description (e.g. White Background, 4 Copies)"
            value={newItem.description}
            onChange={e=>setNewItem({...newItem, description:e.target.value})}
            style={{width:'100%', padding:'10px', border:'1px solid #ddd', borderRadius:'6px', fontFamily:'inherit'}}
            rows="2"
          />
          <button onClick={handleAdd} className="btn-save" style={{width:'100%'}}>+ Add Product</button>
        </div>

        {/* LIST */}
        <div style={{maxHeight:'400px', overflowY:'auto', borderTop:'1px solid #eee'}}>
          {products.map(p => (
            <div key={p.id} className="product-row">
              <div>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                  <span style={{fontWeight:'bold', color:'#4f46e5', background:'#eef2ff', padding:'2px 6px', borderRadius:'4px', fontSize:'0.85rem'}}>{p.code}</span>
                  <span style={{fontWeight:'600'}}>{p.name}</span>
                </div>
                <div style={{fontSize:'0.85rem', color:'#666', marginTop:'2px'}}>{p.description || "No description"}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                <span style={{fontWeight:'bold'}}>LKR {p.price}</span>
                <button onClick={() => handleDelete(p.id)} className="btn-icon-del" title="Remove">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}