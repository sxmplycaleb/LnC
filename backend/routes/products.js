const crypto = require("crypto");
const express = require("express");
const { readDb, writeDb, requireAdmin } = require("../services/store");

const router = express.Router();

function productTags(product) {
  if (Array.isArray(product.tags)) return product.tags;
  return String(product.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function productText(product) {
  return `${product.name} ${product.category} ${product.description} ${productTags(product).join(" ")}`.toLowerCase();
}

function filterProducts(products, query) {
  const search = String(query.search || "").toLowerCase();
  const category = query.category || "all";
  const maxPrice = Number(query.maxPrice || Infinity);
  const minRating = Number(query.minRating || 0);
  const inStock = query.inStock === "true";

  return products.filter((product) => (
    (!search || productText(product).includes(search)) &&
    (category === "all" || !category || product.category === category) &&
    product.price <= maxPrice &&
    product.rating >= minRating &&
    (!inStock || product.stock > 0)
  ));
}

router.get("/", (req, res) => {
  const db = readDb();
  const products = filterProducts(db.products || [], req.query);
  const categories = [...new Set((db.products || []).map((product) => product.category))].sort();
  res.json({ products, categories });
});

router.get("/suggestions", (req, res) => {
  const db = readDb();
  const search = String(req.query.search || "").trim().toLowerCase();
  const suggestions = (db.products || [])
    .filter((product) => search && productText(product).includes(search))
    .flatMap((product) => [product.name, product.category, ...productTags(product)])
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, 8);

  res.json({ suggestions });
});

router.post("/", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = readDb();
  const now = new Date().toISOString();
  const product = {
    id: `prod_${crypto.randomBytes(8).toString("hex")}`,
    name: req.body.name,
    category: req.body.category,
    description: req.body.description,
    price: Number(req.body.price || 0),
    stock: Number(req.body.stock || 0),
    rating: Number(req.body.rating || 0),
    tags: Array.isArray(req.body.tags)
      ? req.body.tags
      : String(req.body.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    image: req.body.image || "",
    reviews: [],
    createdAt: now,
    updatedAt: now
  };

  db.products = db.products || [];
  db.products.unshift(product);
  writeDb(db);

  res.status(201).json({ product });
});

router.put("/:productId", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = readDb();
  const product = (db.products || []).find((entry) => entry.id === req.params.productId);
  if (!product) return res.status(404).json({ error: "Product not found." });

  ["name", "category", "description", "image"].forEach((key) => {
    if (req.body[key] !== undefined) product[key] = req.body[key];
  });
  if (req.body.price !== undefined) product.price = Number(req.body.price);
  if (req.body.stock !== undefined) product.stock = Number(req.body.stock);
  if (req.body.rating !== undefined) product.rating = Number(req.body.rating);
  if (req.body.tags !== undefined) {
    product.tags = Array.isArray(req.body.tags)
      ? req.body.tags
      : String(req.body.tags).split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  product.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json({ product });
});

router.delete("/:productId", (req, res) => {
  if (!requireAdmin(req, res)) return;

  const db = readDb();
  const originalLength = (db.products || []).length;
  db.products = (db.products || []).filter((entry) => entry.id !== req.params.productId);

  if (db.products.length === originalLength) {
    return res.status(404).json({ error: "Product not found." });
  }

  writeDb(db);
  res.json({ message: "Product deleted." });
});

module.exports = router;
