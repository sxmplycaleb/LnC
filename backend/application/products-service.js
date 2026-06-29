const crypto = require("crypto");
const productsRepository = require("../repositories/products");
const { notFound } = require("../http/errors");

function parseTags(tags) {
  return Array.isArray(tags)
    ? tags
    : String(tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function listProducts(query) {
  const result = productsRepository.list(query);
  return {
    products: result.products,
    categories: productsRepository.categories(),
    pagination: {
      total: result.total,
      page: result.page,
      limit: result.limit
    }
  };
}

function suggestions(query) {
  return productsRepository.suggestions(query.search);
}

function createProduct(body) {
  const now = new Date().toISOString();
  return productsRepository.create({
    id: `prod_${crypto.randomBytes(8).toString("hex")}`,
    name: body.name,
    category: body.category,
    description: body.description,
    price: Number(body.price || 0),
    stock: Number(body.stock || 0),
    rating: Number(body.rating || 0),
    tags: parseTags(body.tags),
    image: body.image || "",
    reviews: [],
    createdAt: now,
    updatedAt: now
  });
}

function updateProduct(productId, body) {
  const patch = {};
  ["name", "category", "description", "image"].forEach((key) => {
    if (body[key] !== undefined) patch[key] = body[key];
  });
  if (body.price !== undefined) patch.price = Number(body.price);
  if (body.stock !== undefined) patch.stock = Number(body.stock);
  if (body.rating !== undefined) patch.rating = Number(body.rating);
  if (body.tags !== undefined) patch.tags = parseTags(body.tags);

  const product = productsRepository.update(productId, patch);
  if (!product) throw notFound("Product not found.");
  return product;
}

function deleteProduct(productId) {
  if (!productsRepository.remove(productId)) {
    throw notFound("Product not found.");
  }

  return { message: "Product deleted." };
}

module.exports = {
  listProducts,
  suggestions,
  createProduct,
  updateProduct,
  deleteProduct
};
