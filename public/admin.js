function token() {
  return localStorage.getItem('token') || '';
}

async function login() {
  const username = document.getElementById('user').value;
  const password = document.getElementById('pass').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (res.ok) {
    if (data.token) localStorage.setItem('token', data.token);
    document.getElementById('loginBox').classList.add('hidden');
    document.getElementById('adminArea').classList.remove('hidden');
    loadOrders();
  } else {
    document.getElementById('loginErr').textContent = data.error || 'שגיאה';
  }
}

async function loadOrders() {
  const includeArchived = document.getElementById('showArchived').checked;
  const res = await fetch('/api/orders?includeArchived=' + includeArchived, {
    headers: { 'Authorization': 'Bearer ' + token() }
  });
  const list = await res.json();
  const container = document.getElementById('orders');
  if (!res.ok) {
    container.textContent = list.error || 'שגיאה בטעינת הזמנות';
    return;
  }
  if (list.length === 0) { container.innerHTML = '<p>אין הזמנות</p>'; return; }
  container.innerHTML = list.map(o => {
    const itemsHtml = o.items.map(i => `${i.name} × ${i.quantity} — ${(i.price/100).toFixed(2)} ₪`).join('<br>');
    return `
      <div class="card" style="padding:12px">
        <div class="row" style="justify-content:space-between">
          <div>
            <div>מספר הזמנה: <strong>${o.orderUid}</strong></div>
            <div>זמן: ${new Date(o.createdAt).toLocaleString('he-IL')}</div>
            <div>תשלום: ${o.paymentMethod === 'paypal' ? 'PayPal' : 'מזומן'}</div>
            <div>סטטוס: ${o.status}</div>
          </div>
          <div class="right"><strong>סה"כ: ${(o.total/100).toFixed(2)} ₪</strong></div>
        </div>
        <div class="mt">${itemsHtml}</div>
        <div class="row mt">
          <button data-complete="${o.orderUid}" ${o.status !== 'pending' ? 'disabled' : ''}>סמן כהושלם</button>
          <button class="secondary" data-archive="${o.orderUid}" ${o.status === 'archived' ? 'disabled' : ''}>העבר לארכיון</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('button[data-complete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-complete');
      await fetch('/api/orders/' + uid + '/complete', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token() } });
      loadOrders();
    });
  });
  container.querySelectorAll('button[data-archive]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-archive');
      await fetch('/api/orders/' + uid + '/archive', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token() } });
      loadOrders();
    });
  });
}

async function addProduct() {
  const name = document.getElementById('pname').value.trim();
  const priceShekel = Number(document.getElementById('pprice').value);
  if (!name || !priceShekel) { document.getElementById('productMsg').textContent = 'שם ומחיר חובה'; return; }
  let imageUrl = '';
  const file = document.getElementById('pimgfile').files[0];
  if (file) {
    const fd = new FormData();
    fd.append('image', file);
    const up = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token() }, body: fd });
    const udata = await up.json();
    if (!up.ok) { document.getElementById('productMsg').textContent = udata.error || 'שגיאת העלאה'; return; }
    imageUrl = udata.url;
  }
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify({ name, imageUrl, price: Math.round(priceShekel * 100) })
    });
    const data = await res.json();
    const msg = document.getElementById('productMsg');
    if (res.ok) {
      msg.textContent = 'נוסף בהצלחה.';
      document.getElementById('pname').value = '';
      document.getElementById('pprice').value = '';
      document.getElementById('pimgfile').value = '';
      loadProducts();
    } else {
      console.error('Add product error:', data);
      msg.textContent = data.error || 'שגיאה בהוספת מוצר';
    }
  } catch (error) {
    console.error('Add product error:', error);
    document.getElementById('productMsg').textContent = 'שגיאת רשת';
  }
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('refreshOrders').addEventListener('click', loadOrders);
document.getElementById('showArchived').addEventListener('change', loadOrders);
document.getElementById('addProductBtn').addEventListener('click', addProduct);

async function loadProducts() {
  const res = await fetch('/api/products');
  const list = await res.json();
  const wrap = document.getElementById('productsList');
  if (!Array.isArray(list) || list.length === 0) { wrap.innerHTML = '<p>אין מוצרים</p>'; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>תמונה</th><th>שם</th><th>מחיר (₪)</th><th class=center>תמונה חדשה</th><th class=center>פעולות</th></tr></thead>
      <tbody>
        ${list.map(p => `
          <tr data-id="${p.id}">
            <td class=center><img src="${p.imageUrl || 'https://via.placeholder.com/80x60?text=No+Image'}" alt="img" style="width:80px;height:60px;object-fit:cover"></td>
            <td><input class="name" value="${p.name}"></td>
            <td><input class="price" type="number" step="0.5" value="${(p.price/100).toFixed(2)}"></td>
            <td class=center><input class="file" type="file" accept="image/*"></td>
            <td class=center>
              <button class="save">שמור</button>
              <button class="danger delete">מחק</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('input.file').forEach(inp => {
    inp.addEventListener('change', async () => {
      const tr = inp.closest('tr');
      const id = tr.getAttribute('data-id');
      const file = inp.files[0];
      if (!file) return;
      const fd = new FormData(); fd.append('image', file);
      const up = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token() }, body: fd });
      const udata = await up.json();
      if (up.ok) {
        tr.dataset.imageUrl = udata.url;
        tr.querySelector('img').src = udata.url;
      } else { alert(udata.error || 'שגיאת העלאה'); }
    });
  });

  wrap.querySelectorAll('button.save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const id = tr.getAttribute('data-id');
      const name = tr.querySelector('input.name').value.trim();
      const priceShekel = Number(tr.querySelector('input.price').value);
      const payload = { name, price: Math.round(priceShekel * 100) };
      if (tr.dataset.imageUrl) payload.imageUrl = tr.dataset.imageUrl;
      const res = await fetch('/api/products/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() }, body: JSON.stringify(payload) });
      if (!res.ok) alert('שמירה נכשלה');
    });
  });

  wrap.querySelectorAll('button.delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tr = btn.closest('tr');
      const id = tr.getAttribute('data-id');
      if (!confirm('למחוק מוצר?')) return;
      const res = await fetch('/api/products/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token() } });
      if (res.ok) loadProducts(); else alert('מחיקה נכשלה');
    });
  });
}

// Auto load products after login success; also if already logged in (token exists), show admin area
if (token()) {
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('adminArea').classList.remove('hidden');
  loadOrders();
  loadProducts();
}


