import React, { useState } from 'react';

// Имитация базы данных КВ (Несовместимости)
const kvInteractionCache = {
  1: [3], // Лекарство 1 несовместимо с Лекарством 3
  3: [1],
};

const ReactPharmacyCashier = () => {
  const [cart, setCart] = useState([]);
  const [warning, setWarning] = useState('');
  
  // Доступные медикаменты (эмуляция OLTP)
  const medicines = [
    { id: 1, name: 'Аспирин (Анальгетики)', price: 150, stock: 12 },
    { id: 2, name: 'Амоксициллин (Антибиотики)', price: 420, stock: 5 },
    { id: 3, name: 'Варфарин (Антикоагулянты)', price: 310, stock: 8 },
  ];

  const addToCart = (medicine) => {
    // Проверка несовместимости по Key-Value кэшу
    const incompatibleIds = kvInteractionCache[medicine.id] || [];
    const hasConflict = cart.some(item => incompatibleIds.includes(item.id));

    if (hasConflict) {
      setWarning(`Внимание! ${medicine.name} несовместим с уже добавленными лекарствами в чеке!`);
      return;
    }

    setWarning('');
    const existing = cart.find(item => item.id === medicine.id);
    if (existing) {
      setCart(cart.map(item => item.id === medicine.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...medicine, quantity: 1 }]);
    }
  };

  const handleCheckout = () => {
    alert('Чек успешно проведен в OLTP. Остатки обновлены.');
    setCart([]);
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Рабочее место фармацевта (React)</h2>
      
      <h3>Доступные медикаменты (OLTP Склад)</h3>
      <ul>
        {medicines.map(med => (
          <li key={med.id}>
            {med.name} — {med.price}₽ (Остаток: {med.stock}) 
            <button onClick={() => addToCart(med)} style={{ marginLeft: '10px' }}>Добавить</button>
          </li>
        ))}
      </ul>

      {warning && <div style={{ color: 'red', fontWeight: 'bold', margin: '15px 0' }}>{warning}</div>}

      <h3>Текущий чек</h3>
      {cart.length === 0 ? <p>Чек пуст</p> : (
        <div>
          <ul>
            {cart.map(item => (
              <li key={item.id}>{item.name} x {item.quantity} — {item.price * item.quantity}₽</li>
            ))}
          </ul>
          <button onClick={handleCheckout} style={{ background: 'green', color: 'white', padding: '10px' }}>
            Пробить чек
          </button>
        </div>
      )}
    </div>
  );
};

export default ReactPharmacyCashier;
