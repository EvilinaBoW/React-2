import React, { useState } from 'react';

export default function App() {
  const [cart, setCart] = useState([]);
  const [warning, setWarning] = useState("");

  const addToCart = async (id) => {
    const updatedCart = [...cart, id];
    setCart(updatedCart);

    const res = await fetch('http://localhost:5000/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedCart)
    });
    const data = await res.json();
    setWarning(data.warnings[0] || "");
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>💊 Аптека: Рабочее место провизора (React)</h2>
      <button onClick={() => addToCart(1)}>Добавить Аспирин (ID: 1)</button>
      <button onClick={() => addToCart(2)} style={{ marginLeft: '10px' }}>Добавить Варфарин (ID: 2)</button>
      
      <p><b>Текущий чек (ID лекарств):</b> {cart.join(', ') || 'Пусто'}</p>
      
      {warning && <div style={{ color: 'red', background: '#fee', padding: '10px' }}>{warning}</div>}
    </div>
  );
}
