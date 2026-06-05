# Flagship E-Commerce Platform

A self-contained, fully stacked ecommerce website which utilizes the following technologies: Node.js, vanilla frontend, JWT-based authentication, product searching or filtering functionality, shopping cart and checkout, product administration and order tracking for admins.

## Features

- User registration and login using JWT sessions
- Listing of products with options to filter by searching, category, price, rating, and stock availability
- Customer ratings and reviews
- Shopping cart with options to add quantities and check out
- Customer order tracking
- Administration page to add, edit, and delete products
- Orders listing for administration with status information
- Uploading images locally, optionally uploading images using Cloudinary
- Creating a Stripe Checkout session optionally
- Database backed by file system for simple deployment

## Run Locally

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

Seeded accounts:

```text
Admin: admin@demo.com / Admin123!
User:  customer@demo.com / Customer123!
```

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

When `STRIPE_SECRET_KEY` is missing, checkout creates a demo paid order locally. When Cloudinary variables are missing, uploaded images are stored under `data/uploads` and served by the local server.

## Deployment Notes

- Vercel: use this as a Node server project or split the frontend into static hosting and backend into a serverless function.
- Render: create a Web Service, set the start command to `npm start`, and add the environment variables above.
- For production, replace the file-backed database with PostgreSQL, MongoDB, or another managed database.
