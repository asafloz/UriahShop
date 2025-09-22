function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function renderCart() {
  const container = document.getElementById('cartContainer');
  const cart = loadCart();
  if (cart.length === 0) {
    container.innerHTML = '<p>העגלה ריקה</p>';
    return 0;
  }
  let total = 0;
  const rows = cart.map((item, idx) => {
    const line = item.price * item.quantity;
    total += line;
    return `
      <tr>
        <td>${item.name}</td>
        <td class="right">${(item.price/100).toFixed(2)} ₪</td>
        <td class="center"><input type="number" min="1" value="${item.quantity}" data-idx="${idx}"></td>
        <td class="right">${(line/100).toFixed(2)} ₪</td>
        <td class="center"><button class="danger" data-remove="${idx}">מחק</button></td>
      </tr>
    `;
  }).join('');
  container.innerHTML = `
    <table>
      <thead>
        <tr><th>מוצר</th><th>מחיר</th><th class="center">כמות</th><th>סכום</th><th class="center">פעולה</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><th colspan="3">סכום כולל</th><th class="right">${(total/100).toFixed(2)} ₪</th><th></th></tr>
      </tfoot>
    </table>
  `;

  container.querySelectorAll('input[type=number]').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.idx);
      const cart = loadCart();
      cart[idx].quantity = Math.max(1, Number(inp.value) || 1);
      saveCart(cart);
      renderCart();
    });
  });

  container.querySelectorAll('button[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.remove);
      const cart = loadCart();
      cart.splice(idx, 1);
      saveCart(cart);
      renderCart();
    });
  });
  return total;
}

async function placeOrder() {
  const cart = loadCart();
  if (cart.length === 0) return;
  const method = document.querySelector('input[name=pay]:checked').value;
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cart.map(i => ({ productId: i.id, name: i.name, price: i.price, quantity: i.quantity })),
      paymentMethod: method
    })
  });
  const data = await res.json();
  const result = document.getElementById('result');
  if (res.ok) {
    result.innerHTML = `הזמנה נקלטה. מספר הזמנה: <strong>${data.orderUid}</strong> | זמן: ${new Date(data.createdAt).toLocaleString('he-IL')}`;
    localStorage.removeItem('cart');
    renderCart();
  } else {
    result.textContent = data.error || 'שגיאה ביצירת הזמנה';
  }
}

document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

renderCart();


