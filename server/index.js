import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';

import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Auth: single admin (username: admin, password: 12345678)
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('12345678', 8);

function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') return res.status(401).json({ error: 'Unauthorized' });
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// API routes
const api = express.Router();

// Products
api.get('/products', async (req, res) => {
  try {
    const products = await db.listProducts();
    console.log('Products loaded:', products.length);
    res.json(products);
  } catch (error) {
    console.error('Error loading products:', error);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

api.post('/products', requireAuth, async (req, res) => {
  try {
    const { name, imageUrl, price } = req.body;
    console.log('Adding product:', { name, imageUrl, price });
    if (!name || typeof price !== 'number') {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const product = await db.addProduct({ name, imageUrl, price });
    console.log('Product added:', product);
    res.json(product);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

api.put('/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, imageUrl, price } = req.body;
  const ok = db.updateProduct({ id, name, imageUrl, price });
  if (!ok) return res.status(400).json({ error: 'No changes or not found' });
  res.json({ success: true });
});

api.delete('/products/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const ok = db.deleteProduct(id);
  res.json({ success: ok });
});

// Upload image
const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + Math.random().toString(36).slice(2, 10) + path.extname(file.originalname || '.jpg');
    cb(null, safe);
  }
});
const upload = multer({ storage });

api.post('/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// Orders
api.post('/orders', (req, res) => {
  const { items, paymentMethod } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items required' });
  }
  if (!['paypal', 'cash'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'invalid paymentMethod' });
  }
  // Calculate total in agorot
  let total = 0;
  const normalizedItems = [];
  for (const item of items) {
    if (!item.name || typeof item.price !== 'number' || typeof item.quantity !== 'number') {
      return res.status(400).json({ error: 'invalid item' });
    }
    const line = item.price * item.quantity;
    total += line;
    normalizedItems.push({
      productId: item.productId || null,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
    });
  }
  const order = db.createOrder({ items: normalizedItems, total, paymentMethod });
  res.json(order);
});

api.get('/orders', requireAuth, (req, res) => {
  const includeArchived = String(req.query.includeArchived || 'false') === 'true';
  res.json(db.listOrders({ includeArchived }));
});

api.post('/orders/:orderUid/complete', requireAuth, (req, res) => {
  const ok = db.markOrderCompleted(req.params.orderUid);
  res.json({ success: ok });
});

api.post('/orders/:orderUid/archive', requireAuth, (req, res) => {
  const ok = db.archiveOrder(req.params.orderUid);
  res.json({ success: ok });
});

// Auth endpoints
api.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid credentials' });
  if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '2d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ token });
});

api.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.use('/api', api);

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
});


