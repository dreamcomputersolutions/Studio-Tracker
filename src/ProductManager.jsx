import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, onSnapshot, doc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export default function ProductManager({ onClose }) {
  const [products, setProducts] = useState([]);
  const [newItem, setNewItem] = useState({ code: '', name: '', price: '', description: '' });
  const [editingId, setEditingId] = useState(null); // Track if we are editing

  // Load Products
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("code"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return unsubscribe;
  }, []);

  // Handle Submit (Add or Update)
  const handleSave = async () => {
    if(!newItem.code || !newItem.name || !newItem.price) return alert("Fill Code, Name and Price");

    const cleanCode = newItem.code.trim().toUpperCase();

    // Duplicate Check (Exclude current item if editing)
    const isDuplicate = products.some(p => 
      p.code.toUpperCase() === cleanCode && p.id !== editingId
    );

    if (isDuplicate) return alert(`Product Code "${cleanCode}" already exists!`);

    const productData = {
      code: cleanCode,
      name: newItem.name,
      price: newItem.price,
      description: newItem.description
    };

    if (editingId) {
      // UPDATE EXISTING
      await updateDoc(doc(db, "products", editingId), productData);
      setEditingId(null); // Exit edit mode
    } else {
      // CREATE NEW
      await addDoc(collection(db, "products"), productData);
    }
    
    // Reset Form
    setNewItem({ code: '', name: '', price: '', description: '' });
  };

  const handleEdit = (product) => {
    setNewItem({ 
      code: product.code, 
      name: product.name, 
      price: product.price, 
      description: product.description || '' 
    });
    setEditingId(product.id);
  };

  const handleCancelEdit = () => {
    setNewItem({ code: '', name: '', price: '', description: '' });
    setEditingId(null);
  };

  const handleDelete = async (id) => {
    if(confirm("Delete this product?")) await deleteDoc(doc(db, "products", id));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {/* HEADER */}
        <div className="pm-header">
          <h2 style={{margin:0, color:'#333'}}>
            {editingId ? "Edit Service" : "Product Manager"}
          </h2>
          <button onClick={onClose} className="btn-close-fancy"><span>&times;</span> Close</button>
        </div>

        {/* FORM */}
        <div className="product-form" style={{border: editingId ? '2px solid #4f46e5' : '1px solid #e5e7eb'}}>
          <div style={{display:'flex', gap:'10px'}}>
            <input 
              placeholder="Code" 
              value={newItem.code} 
              onChange={e=>setNewItem({...newItem, code:e.target.value})} 
              style={{width:'80px'}} 
            />
            <input 
              placeholder="Service Name" 
              value={newItem.name} 
              onChange={e=>setNewItem({...newItem, name:e.target.value})} 
              style={{flex:1}}
            />
            <input 
              placeholder="Price" 
              type="number" 
              value={newItem.price} 
              onChange={e=>setNewItem({...newItem, price:e.target.value})} 
              style={{width:'100px'}} 
            />
          </div>
          <textarea 
            placeholder="Default Description (e.g. White Background)"
            value={newItem.description}
            onChange={e=>setNewItem({...newItem, description:e.target.value})}
            style={{width:'100%', padding:'10px', border:'1px solid #ddd', borderRadius:'6px', fontFamily:'inherit'}}
            rows="2"
          />
          
          <div style={{display:'flex', gap:'10px'}}>
            <button onClick={handleSave} className="btn-save" style={{width:'100%'}}>
              {editingId ? "Update Product" : "+ Add Product"}
            </button>
            {editingId && (
              <button onClick={handleCancelEdit} style={{background:'#f3f4f6', border:'none', padding:'0 15px', borderRadius:'8px', cursor:'pointer'}}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* LIST */}
        <div style={{maxHeight:'400px', overflowY:'auto', borderTop:'1px solid #eee'}}>
          {products.map(p => (
            <div key={p.id} className="product-row" style={{background: editingId === p.id ? '#eef2ff' : 'white'}}>
              <div>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                  <span style={{fontWeight:'bold', color:'#4f46e5', background:'#eef2ff', padding:'2px 6px', borderRadius:'4px', fontSize:'0.85rem'}}>{p.code}</span>
                  <span style={{fontWeight:'600'}}>{p.name}</span>
                </div>
                <div style={{fontSize:'0.85rem', color:'#666', marginTop:'2px'}}>{p.description || "No description"}</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <span style={{fontWeight:'bold', marginRight:'10px'}}>LKR {p.price}</span>
                <button onClick={() => handleEdit(p)} className="btn-icon" title="Edit">✎</button>
                <button onClick={() => handleDelete(p.id)} className="btn-icon-del" title="Remove">🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}