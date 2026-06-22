const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const { createUploadthingExpressHandler } = require("uploadthing/express");
const { ourFileRouter } = require("./uploadthing");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const uploadRoutes = require("./routes/uploads");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "..", "frontend");

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

app.use(cors());
app.use(express.json({ limit: "12mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/uploads", uploadRoutes);
app.post("/api/mpesa/callback", orderRoutes.mpesaCallback);
app.use(
  "/api/uploadthing",
  createUploadthingExpressHandler({
    router: ourFileRouter,
    config: { token: process.env.UPLOADTHING_TOKEN }
  })
);

function serveStatic(req, res) {
  const requestedPath = req.path === "/" ? "/index.html" : decodeURIComponent(req.path);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }

  res.type(MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  fs.createReadStream(filePath).pipe(res);
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API endpoint not found." });
    return;
  }
  serveStatic(req, res, next);
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Something went wrong." });
});

app.listen(PORT, () => {
  console.log(`L&C Enterprise running at http://localhost:${PORT}`);
});
