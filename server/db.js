import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Allow overriding DB directory via env (useful for Render persistent disk)
const dbDirectoryPath = process.env.DB_DIR || path.join(process.cwd(), 'db');
const dbFilePath = path.join(dbDirectoryPath, 'shop.db');

if (!fs.existsSync(dbDirectoryPath)) {
  fs.mkdirSync(dbDirectoryPath, { recursive: true });
}

const db = new Database(dbFilePath);

db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  imageUrl TEXT,
  price INTEGER NOT NULL -- price in agorot (cents)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderUid TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | archived
  paymentMethod TEXT NOT NULL, -- paypal | cash
  total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  productId INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY(orderId) REFERENCES orders(id)
);
`);

// Seed some sample products if empty
const getProductCount = db.prepare('SELECT COUNT(1) as c FROM products');
const productCount = getProductCount.get().c;
if (productCount === 0) {
  const seed = db.prepare('INSERT INTO products (name, imageUrl, price) VALUES (?, ?, ?)');
  seed.run('Example Product 1', 'https://via.placeholder.com/300x200?text=Product+1', 3990);
  seed.run('Example Product 2', 'https://via.placeholder.com/300x200?text=Product+2', 2590);
  seed.run('Example Product 3', 'https://via.placeholder.com/300x200?text=Product+3', 1490);
  seed.run('Example Product 4', 'https://via.placeholder.com/300x200?text=Product+4', 990);
  seed.run('Example Product 5', 'https://via.placeholder.com/300x200?text=Product+5', 1990);
  seed.run('Example Product 6', 'https://via.placeholder.com/300x200?text=Product+6', 2990);
}

export function listProducts() {
  const stmt = db.prepare('SELECT id, name, imageUrl, price FROM products ORDER BY id DESC');
  return stmt.all();
}

export function addProduct({ name, imageUrl, price }) {
  const insert = db.prepare('INSERT INTO products (name, imageUrl, price) VALUES (?, ?, ?)');
  const info = insert.run(name, imageUrl || null, price);
  return { id: info.lastInsertRowid, name, imageUrl, price };
}

export function updateProduct({ id, name, imageUrl, price }) {
  const fields = [];
  const values = [];
  if (typeof name === 'string') { fields.push('name = ?'); values.push(name); }
  if (typeof imageUrl === 'string') { fields.push('imageUrl = ?'); values.push(imageUrl); }
  if (typeof price === 'number') { fields.push('price = ?'); values.push(price); }
  if (fields.length === 0) return false;
  values.push(id);
  const stmt = db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`);
  const info = stmt.run(...values);
  return info.changes > 0;
}

export function deleteProduct(id) {
  const stmt = db.prepare('DELETE FROM products WHERE id = ?');
  const info = stmt.run(id);
  return info.changes > 0;
}

export function createOrder({ items, total, paymentMethod }) {
  const nowIso = new Date().toISOString();
  const orderUid = generateOrderUid();
  const insertOrder = db.prepare(
    'INSERT INTO orders (orderUid, createdAt, status, paymentMethod, total) VALUES (?, ?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (orderId, productId, name, price, quantity) VALUES (?, ?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    const orderInfo = insertOrder.run(orderUid, nowIso, 'pending', paymentMethod, total);
    const orderId = orderInfo.lastInsertRowid;
    for (const item of items) {
      insertItem.run(orderId, item.productId ?? 0, item.name, item.price, item.quantity);
    }
    return orderId;
  });

  const orderId = transaction();
  return getOrderByUid(orderUid);
}

export function listOrders({ includeArchived = false } = {}) {
  const stmt = db.prepare(
    includeArchived
      ? 'SELECT id, orderUid, createdAt, status, paymentMethod, total FROM orders ORDER BY id DESC'
      : "SELECT id, orderUid, createdAt, status, paymentMethod, total FROM orders WHERE status != 'archived' ORDER BY id DESC"
  );
  const orders = stmt.all();
  const itemsStmt = db.prepare('SELECT productId, name, price, quantity FROM order_items WHERE orderId = ?');
  for (const order of orders) {
    order.items = itemsStmt.all(order.id);
  }
  return orders;
}

export function markOrderCompleted(orderUid) {
  const stmt = db.prepare("UPDATE orders SET status = 'completed' WHERE orderUid = ?");
  const info = stmt.run(orderUid);
  return info.changes > 0;
}

export function archiveOrder(orderUid) {
  const stmt = db.prepare("UPDATE orders SET status = 'archived' WHERE orderUid = ?");
  const info = stmt.run(orderUid);
  return info.changes > 0;
}

export function getOrderByUid(orderUid) {
  const stmt = db.prepare('SELECT id, orderUid, createdAt, status, paymentMethod, total FROM orders WHERE orderUid = ?');
  const order = stmt.get(orderUid);
  if (!order) return null;
  const itemsStmt = db.prepare('SELECT productId, name, price, quantity FROM order_items WHERE orderId = ?');
  order.items = itemsStmt.all(order.id);
  return order;
}

function generateOrderUid() {
  // 8-char base36 unique id
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


