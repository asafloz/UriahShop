Setup and run

Prerequisites: Node.js 18+ installed and available as `node` and `npm` in PATH.

Install dependencies:

1. Open a terminal in `C:\Users\asafl\shop-app`
2. Run: `npm install`
3. Start dev server: `npm run start`

App will listen on http://localhost:3000

Features

- Product grid (3 per row), add to cart with quantity
- Cart page: update quantities, remove items, total sum
- Checkout: choose PayPal or cash. For cash, transfer via PayBox to 054-788-6286
- Order created with unique order ID and timestamp
- Admin page: login (username `admin`, password `12345678`), list orders, mark completed, archive, add products

Configuration

- JWT secret: set env `JWT_SECRET` for production

Deploy

- You can deploy this as a Node app on services like Render/Heroku/Fly.io. Ensure persistent storage for `db/shop.db` or use external DB.



