# LnC Streetwear

A self-contained street fashion ecommerce website built with Node.js, a vanilla frontend, JWT-based authentication, product search and filters, shopping cart and checkout, product administration, and order tracking.

## Features

- User registration and login using JWT sessions
- Empty product catalog ready for merchant-added streetwear drops
- Product filters for search, category, price, rating, and stock availability
- Customer ratings and reviews for future product entries
- Shopping cart with options to add quantities and check out
- Customer order tracking
- Administration page to add, edit, and delete products
- Orders listing for administration with status information
- Uploading product images locally, optionally uploading images using Cloudinary
- Creating a Stripe Checkout session optionally
- Database backed by file system for simple deployment

## Run Locally

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Project Structure

```text
backend/   Node/Express server, routes, API helpers, and backend scripts
frontend/  Static HTML, CSS, and browser JavaScript
```

The storefront starts without demo products, orders, categories, reviews, or placeholder inventory.

## Optional Environment Variables

Create a `.env` file or set environment variables in your host.

```text
PORT=3000
JWT_SECRET=replace-with-a-long-random-secret
APP_URL=http://localhost:3000

STRIPE_SECRET_KEY=sk_test_...

CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
```

When payment provider credentials are missing, checkout remains guarded by the existing local payment flow. When Cloudinary variables are missing, uploaded images are stored under `data/uploads` and served by the local server.
