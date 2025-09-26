import pkg from 'pg';
const { Pool } = pkg;

function createPool() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || 'postgres',
  });
}

const pool = createPool();

async function initSchema() {
  // Wait for database to be reachable (useful on cold starts)
  const maxAttempts = 10;
  const delayMs = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (attempt === maxAttempts) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    price INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_uid TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT NOT NULL,
    total INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  );
  `);

  const { rows } = await pool.query('SELECT COUNT(1) as c FROM products');
  const c = Number(rows[0].c);
  if (c === 0) {
    await pool.query(
      `INSERT INTO products (name, image_url, price) VALUES 
       ($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12),($13,$14,$15),($16,$17,$18)`,
      [
        'Example Product 1', 'https://via.placeholder.com/300x200?text=Product+1', 3990,
        'Example Product 2', 'https://via.placeholder.com/300x200?text=Product+2', 2590,
        'Example Product 3', 'https://via.placeholder.com/300x200?text=Product+3', 1490,
        'Example Product 4', 'https://via.placeholder.com/300x200?text=Product+4', 990,
        'Example Product 5', 'https://via.placeholder.com/300x200?text=Product+5', 1990,
        'Example Product 6', 'https://via.placeholder.com/300x200?text=Product+6', 2990
      ]
    );
  }
}

await initSchema();

export async function listProducts() {
  const { rows } = await pool.query('SELECT id, name, image_url as "imageUrl", price FROM products ORDER BY id DESC');
  return rows;
}

export async function addProduct({ name, imageUrl, price }) {
  const { rows } = await pool.query(
    'INSERT INTO products (name, image_url, price) VALUES ($1,$2,$3) RETURNING id, name, image_url as "imageUrl", price',
    [name, imageUrl || null, price]
  );
  return rows[0];
}

export async function updateProduct({ id, name, imageUrl, price }) {
  const fields = [];
  const values = [];
  if (typeof name === 'string') { fields.push('name = $' + (fields.length + 1)); values.push(name); }
  if (typeof imageUrl === 'string') { fields.push('image_url = $' + (fields.length + 1)); values.push(imageUrl); }
  if (typeof price === 'number') { fields.push('price = $' + (fields.length + 1)); values.push(price); }
  if (fields.length === 0) return false;
  values.push(id);
  const sql = `UPDATE products SET ${fields.join(', ')} WHERE id = $${fields.length + 1}`;
  const res = await pool.query(sql, values);
  return res.rowCount > 0;
}

export async function deleteProduct(id) {
  const res = await pool.query('DELETE FROM products WHERE id = $1', [id]);
  return res.rowCount > 0;
}

export async function createOrder({ items, total, paymentMethod }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nowIso = new Date().toISOString();
    const orderUid = generateOrderUid();
    const orderRes = await client.query(
      'INSERT INTO orders (order_uid, created_at, status, payment_method, total) VALUES ($1,$2,$3,$4,$5) RETURNING id, order_uid as "orderUid", created_at as "createdAt", status, payment_method as "paymentMethod", total',
      [orderUid, nowIso, 'pending', paymentMethod, total]
    );
    const order = orderRes.rows[0];
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES ($1,$2,$3,$4,$5)',
        [order.id, item.productId ?? null, item.name, item.price, item.quantity]
      );
    }
    await client.query('COMMIT');
    return await getOrderByUid(order.orderUid);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function listOrders({ includeArchived = false } = {}) {
  const sql = includeArchived
    ? 'SELECT id, order_uid as "orderUid", created_at as "createdAt", status, payment_method as "paymentMethod", total FROM orders ORDER BY id DESC'
    : "SELECT id, order_uid as \"orderUid\", created_at as \"createdAt\", status, payment_method as \"paymentMethod\", total FROM orders WHERE status != 'archived' ORDER BY id DESC";
  const { rows } = await pool.query(sql);
  for (const o of rows) {
    const { rows: items } = await pool.query('SELECT product_id as "productId", name, price, quantity FROM order_items WHERE order_id = $1', [o.id]);
    o.items = items;
  }
  return rows;
}

export async function markOrderCompleted(orderUid) {
  const res = await pool.query("UPDATE orders SET status = 'completed' WHERE order_uid = $1", [orderUid]);
  return res.rowCount > 0;
}

export async function archiveOrder(orderUid) {
  const res = await pool.query("UPDATE orders SET status = 'archived' WHERE order_uid = $1", [orderUid]);
  return res.rowCount > 0;
}

export async function getOrderByUid(orderUid) {
  const { rows } = await pool.query('SELECT id, order_uid as "orderUid", created_at as "createdAt", status, payment_method as "paymentMethod", total FROM orders WHERE order_uid = $1', [orderUid]);
  const order = rows[0];
  if (!order) return null;
  const { rows: items } = await pool.query('SELECT product_id as "productId", name, price, quantity FROM order_items WHERE order_id = $1', [order.id]);
  order.items = items;
  return order;
}

function generateOrderUid() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export default {
  listProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  createOrder,
  listOrders,
  markOrderCompleted,
  archiveOrder,
  getOrderByUid,
};


