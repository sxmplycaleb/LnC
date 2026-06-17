const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cors = require("cors");
const dotenv = require("dotenv");
const { createUploadthingExpressHandler } = require("uploadthing/express");
const { ourFileRouter } = require("./uploadthing");
const { router: userRoutes } = require('./routes/users');
const orderRoutes = require('./routes/orders');

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);

const uploadthingHandler = createUploadthingExpressHandler({
  router: ourFileRouter,
  config: {
    token: process.env.UPLOADTHING_TOKEN,
  },
});
app.use("/api/uploadthing", uploadthingHandler);

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "..", "frontend");
const DB_FILE = path.join(__dirname, "..", "db.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function filterProducts(products, params) {
  const search = (params.get("search") || "").toLowerCase();
  const category = params.get("category") || "all";
  const maxPrice = Number(params.get("maxPrice") || Infinity);
  const minRating = Number(params.get("minRating") || 0);
  const inStock = params.get("inStock") === "true";

  return products.filter((product) => {
    const tags = Array.isArray(product.tags) ? product.tags.join(" ") : String(product.tags || "");
    const text = `${product.name} ${product.category} ${product.description} ${tags}`.toLowerCase();

    return (!search || text.includes(search))
      && (category === "all" || product.category === category)
      && product.price <= maxPrice
      && product.rating >= minRating
      && (!inStock || product.stock > 0);
  });
}

let currentUser = null; // In-memory user session (for demo purposes only)

function getBearerUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return currentUser;

  const db = readDb();
  return (db.users || []).find((user) => user.id === token) || currentUser;
}

function requireAdmin(req, res) {
  const user = getBearerUser(req);

  if (user?.role !== "admin") {
    sendJson(res, 403, { error: "Admin access required." });
    return null;
  }

  return user;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    return sendJson(res, 200, { user: publicUser(currentUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    const db = readDb();
    
    const user = (db.users || []).find((entry) => entry.email === body.email);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid email or password." });
    }

    currentUser = user;

    return sendJson(res, 200, { 
      user: publicUser(user),
      token: user.id // In a real app, use a proper JWT or session token
     });
}

if (req.method === "POST" && url.pathname === "/api/auth/register") {
  const body = await readBody(req);
  const db = readDb();

  if ((db.users || []).some((user) => user.email === body.email)) {
    return sendJson(res, 400, { error: "Email already in use." });
  }

  const user = {
    id: `user_${crypto.randomBytes(8).toString("hex")}`,
    name: body.name || "Customer",
    email: body.email,
    passwordHash: hashPassword(body.password),
    role: "customer",
    createdAt: new Date().toISOString()
  };

  db.users = db.users || [];
  db.users.push(user);
  writeDb(db);

  currentUser = user;

  return sendJson(res, 201, {
    user: publicUser(user),
    token: user.id // In a real app, use a proper JWT or session token
  });
}   

if (req.method === "POST" && url.pathname === "/api/auth/logout") {
  currentUser = null;
  return sendJson(res, 200, { message: "Logged out successfully." });
}

if (req.method === "POST" && url.pathname === "/api/mpesa/callback") {
  const body = await readBody(req);
  const callback = body.Body?.stkCallback;
  const checkoutRequestId = callback?.CheckoutRequestID;
  const resultCode = callback?.ResultCode;

  const db = readDb();
  const order = (db.orders || []).find(
    (entry) => entry.mpesaCheckoutRequestId === checkoutRequestId
  );

  if (order) {
    order.paymentStatus = resultCode === 0 ? "Paid" : "Failed";
    order.status = resultCode === 0 ? "Processing" : "Payment Failed";
    order.mpesaResult = callback;
    writeDb(db);
  }

  return sendJson(res, 200, { ResultCode: 0, ResultDesc: "Accepted"});
}

if (req.method === "GET" && url.pathname === "/api/products") {
  const db = readDb();  
  const products = filterProducts(db.products || [], url.searchParams);
  const categories = [...new Set((db.products || []).map((product) => product.category))].sort();
  return sendJson(res, 200, { products, categories });    
}

if (req.method === "POST" && url.pathname === "/api/products") {
  if (!requireAdmin(req, res)) return;

  const body = await readBody(req);
  const db = readDb();
  const now = new Date().toISOString();
  const product = {
    id: `prod_${crypto.randomBytes(8).toString("hex")}`,
    name: body.name,
    category: body.category,
    description: body.description,
    price: Number(body.price || 0),
    stock: Number(body.stock || 0),
    rating: Number(body.rating || 0),
    tags: Array.isArray(body.tags)
      ? body.tags
      : String(body.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    image: body.image || "",
    reviews: [],
    createdAt: now,
    updatedAt: now
  };

  db.products = db.products || [];
  db.products.unshift(product);
  writeDb(db);

  return sendJson(res, 201, { product });
}

if (req.method === "PUT" && url.pathname.startsWith("/api/products/")) {
  if (!requireAdmin(req, res)) return;

  const productId = url.pathname.split("/").pop();
  const body = await readBody(req);
  const db = readDb();
  const product = (db.products || []).find((entry) => entry.id === productId);

  if (!product) {
    return sendJson(res, 404, { error: "Product not found." });
  }

  ["name", "category", "description", "image"].forEach((key) => {
    if (body[key] !== undefined) product[key] = body[key];
  });

  if (body.price !== undefined) product.price = Number(body.price);
  if (body.stock !== undefined) product.stock = Number(body.stock);
  if (body.rating !== undefined) product.rating = Number(body.rating);
  if (body.tags !== undefined) {
    product.tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  product.updatedAt = new Date().toISOString();
  writeDb(db);

  return sendJson(res, 200, { product });
}

if (req.method === "DELETE" && url.pathname.startsWith("/api/products/")) {
  if (!requireAdmin(req, res)) return;

  const productId = url.pathname.split("/").pop();
  const db = readDb();
  const originalLength = (db.products || []).length;
  db.products = (db.products || []).filter((entry) => entry.id !== productId);

  if (db.products.length === originalLength) {
    return sendJson(res, 404, { error: "Product not found." });
  }

  writeDb(db);
  return sendJson(res, 200, { message: "Product deleted." });
}

if (req.method === "POST" && url.pathname === "/api/uploads") {
  const body = await readBody(req);

  if (!body.dataUrl) {
    return sendJson(res, 400, { error: "Missing image data." });
  }

  return sendJson(res, 201, { url: body.dataUrl });
}

if (req.method === "GET" && url.pathname === "/api/orders") {
  if (!currentUser) {
    return sendJson(res, 401, { error: "Sign in to view orders." });
  }

  const db = readDb();
  const orders = currentUser.role === "admin"
    ? db.orders || []
    : (db.orders || []).filter((order) => order.userId === currentUser.id);

  return sendJson(res, 200, { orders });
}

if (req.method === "POST" && url.pathname === "/api/orders") {
  if (!currentUser) {
    return sendJson(res, 401, { error: "Sign in before checkout." });
  }

  const body = await readBody(req);
  const db = readDb();
  const requestedItems = Array.isArray(body.items) ? body.items : [];

  if (!requestedItems.length) {
    return sendJson(res, 400, { error: "Add products to your cart first." });
  }

  if (!body.paymentMethod) {
    return sendJson(res, 400, { error: "Select a payment method." });
  }

  const orderItems = [];

  for (const item of requestedItems) {
    const quantity = Number(item.quantity || 0);
    const product = (db.products || []).find((entry) => entry.id === item.productId);

    if (!product || quantity < 1) {
      return sendJson(res, 400, { error: "Your cart contains an unavailable product." });
    }

    if (product.stock < quantity) {
      return sendJson(res, 400, { error: `${product.name} does not have enough stock.` });
    }

    product.stock -= quantity;
    product.updatedAt = new Date().toISOString();

    orderItems.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      price: product.price,
      quantity,
      subtotal: Number((product.price * quantity).toFixed(2))
    });
  }

  const subtotal = Number(orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const shipping = subtotal >= 100 ? 0 : 12;
  const tax = Number((subtotal * 0.08).toFixed(2));
  const now = new Date().toISOString();
  const order = {
    id: `ord_${crypto.randomBytes(8).toString("hex")}`,
    userId: currentUser.id,
    customer: publicUser(currentUser),
    items: orderItems,
    shippingAddress: body.shippingAddress || {},
    subtotal,
    shipping,
    tax,
    total: Number((subtotal + shipping + tax).toFixed(2)),
    status: "Processing",
    paymentStatus: "Paid",
    paymentProvider: body.paymentMethod,
    timeline: [
      { label: "Order placed", at: now },
      { label: "Payment confirmed", at: now }
    ],
    createdAt: now
  };

  db.orders = db.orders || [];
  if (body.paymentMethod === "m-pesa") {
    const stk = await initiateStkPush({
      phone: body.mpesaPhone,
      amount: order.total,
      orderId: order.id
    });

    order.paymentStatus = "Pending";
    order.mpesaCheckoutRequestId = stk.CheckoutRequestID;
    order.mpesaMerchantRequestId = stk.MerchantRequestID;
    order.mpesaResponse = stk;
  }

db.orders.unshift(order);
writeDb(db);

return sendJson(res, 201, { order });
}

if (req.method === "PUT" && url.pathname.startsWith("/api/orders/")) {
  if (currentUser?.role !== "admin") {
    return sendJson(res, 403, { error: "Admin access required." });
  }

  const orderId = url.pathname.split("/").pop();
  const body = await readBody(req);
  const db = readDb();
  const order = (db.orders || []).find((entry) => entry.id === orderId);

  if (!order) {
    return sendJson(res, 404, { error: "Order not found." });
  }

  order.status = body.status || order.status;
  order.timeline = order.timeline || [];
  order.timeline.push({ label: order.status, at: new Date().toISOString() });
  writeDb(db);

  return sendJson(res, 200, { order });
}

return sendJson(res, 404, { error: "API endpoint not found." });
}

function mpesaBaseUrl() {
  return process.env.MPESA_ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke"
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)
}

async function getMpesaToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });

  const data = await response.json();
  return data.access_token;  
}

async function initiateStkPush({ phone, amount, orderId }) {
  const token = await getMpesaToken();
  const timestamp = mpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");

  const response = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"      
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackUrl: process.env.MPESA_CALLBACK_URL,
      AccountReference: orderId,
      TransactionDesc: "L&C Enterprise checkout"
    })
  });

  return response.json();
}
    
  

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", (error) => {
      reject(error);
    });
  });  
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const storedPassword = String(passwordHash || "");
  const separator = storedPassword.includes(":") ? ":" : "$";
  const [salt, originalHash] = storedPassword.split(separator);

  if (!password || !salt || !originalHash) return false;

  const testHash = hashPassword(password, salt).split(":")[1];

  return crypto.timingSafeEqual(
    Buffer.from(originalHash, "hex"),
    Buffer.from(testHash, "hex")
  );
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname.startsWith("/api/")) {
     await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Something went wrong." });
  }
});

console.log("Reached server.listen");

server.listen(PORT, () => {
  console.log(`L&C Enterprise running at http://localhost:${PORT}`);
});
