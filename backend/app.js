const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { createUploadthingExpressHandler } = require("uploadthing/express");
const { ourFileRouter } = require("./uploadthing");
const config = require("./config");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const uploadRoutes = require("./routes/uploads");

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

function createApp() {
  const app = express();

  app.use((req, res, next) => {
    req.requestId = req.headers["x-request-id"] || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: config.jsonBodyLimit }));

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

  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API endpoint not found." });
      return;
    }
    serveStatic(req, res);
  });

  app.use((error, req, res, next) => {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error({ requestId: req.requestId, error });
    res.status(statusCode).json({
      error: error.message || "Something went wrong.",
      requestId: req.requestId
    });
  });

  return app;
}

module.exports = {
  createApp
};
