async function fetchProducts() {
  const res = await fetch('/api/products');
  return res.json();
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(product, quantity) {
  const cart = loadCart();
  const idx = cart.findIndex(i => i.id === product.id);
  const q = Number(quantity) || 1;
  if (idx >= 0) {
    cart[idx].quantity += q;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, quantity: q });
  }
  saveCart(cart);
  alert('נוסף לעגלה');
}

function render(products) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img src="${p.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${p.name}">
      <div class="content">
        <div>${p.name}</div>
        <div class="price">${(p.price/100).toFixed(2)} ₪</div>
        <div class="row">
          <input type="number" min="1" value="1" />
          <button>הוסף לסל</button>
        </div>
      </div>
    `;
    const qtyInput = card.querySelector('input');
    const btn = card.querySelector('button');
    btn.addEventListener('click', () => addToCart(p, qtyInput.value));
    grid.appendChild(card);
  });
}

fetchProducts().then(render);


