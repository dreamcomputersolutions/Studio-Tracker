import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, onSnapshot, doc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export default function ProductManager({ onClose }) {
  const [products, setProducts] = useState([]);
  const [newItem, setNewItem] = useState({ code: '', name: '', price: '' });

  // Load Products
  useEffect(() => {
    const q = query(collection(db, "products"), orderBy("code"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ ...d.data(), id: d.id })));
    });
    return unsubscribe;
  }, []);

  const handleAdd = async () => {
    if(!newItem.code || !newItem.name || !newItem.price) return alert("Fill all fields");
    await addDoc(collection(db, "products"), newItem);
    setNewItem({ code: '', name: '', price: '' });
  };

  const handleDelete = async (id) => {
    if(confirm("Delete this product?")) await deleteDoc(doc(db, "products", id));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{display:'flex', justifyContent:'space-between'}}>
          <h2>Product & Service Manager</h2>
          <button onClick={onClose} style={{background:'red', width:'auto'}}>X</button>
        </div>

        {/* Add Form */}
        <div className="product-form">
          <input placeholder="Code (e.g. P01)" value={newItem.code} onChange={e=>setNewItem({...newItem, code:e.target.value})} style={{width:'80px'}} />
          <input placeholder="Service Name (e.g. Passport 4x)" value={newItem.name} onChange={e=>setNewItem({...newItem, name:e.target.value})} />
          <input placeholder="Price" type="number" value={newItem.price} onChange={e=>setNewItem({...newItem, price:e.target.value})} style={{width:'100px'}} />
          <button onClick={handleAdd} style={{width:'auto'}}>Add</button>
        </div>

        {/* Product List */}
        <div className="product-list">
          {products.map(p => (
            <div key={p.id} className="product-row">
              <span style={{fontWeight:'bold', width:'50px'}}>{p.code}</span>
              <span style={{flex:1}}>{p.name}</span>
              <span style={{width:'80px'}}>LKR {p.price}</span>
              <button onClick={() => handleDelete(p.id)} className="btn-icon">🗑️</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}