const { db, json, parseJson } = require("./database");
const config = require("../config");

function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: row.price,
    stock: row.stock,
    rating: row.rating,
    tags: parseJson(row.tags_json, []),
    image: row.image,
    reviews: parseJson(row.reviews_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function all() {
  return db.prepare("SELECT * FROM products ORDER BY created_at DESC, rowid DESC").all().map(toProduct);
}

function escapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, (match) => `\\${match}`);
}

function productFilters(query = {}) {
  const clauses = [];
  const params = {};
  const search = String(query.search || "").trim().toLowerCase();
  const category = String(query.category || "").trim();
  const maxPrice = Number(query.maxPrice);
  const minRating = Number(query.minRating);
  const inStock = query.inStock === "true" || query.inStock === true;

  if (search) {
    clauses.push(`
      lower(name || ' ' || category || ' ' || coalesce(description, '') || ' ' || coalesce(tags_json, '')) LIKE @search ESCAPE '\\'
    `);
    params.search = `%${escapeLike(search)}%`;
  }

  if (category && category !== "all") {
    clauses.push("category = @category");
    params.category = category;
  }

  if (Number.isFinite(maxPrice)) {
    clauses.push("price <= @maxPrice");
    params.maxPrice = maxPrice;
  }

  if (Number.isFinite(minRating)) {
    clauses.push("rating >= @minRating");
    params.minRating = minRating;
  }

  if (inStock) {
    clauses.push("stock > 0");
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

function pageSettings(query = {}) {
  const requestedLimit = Number(query.limit);
  const requestedPage = Number(query.page);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), config.productQueryLimit)
    : null;
  const page = Number.isFinite(requestedPage) ? Math.max(Math.trunc(requestedPage), 1) : 1;

  return {
    limit,
    page,
    offset: limit ? (page - 1) * limit : 0
  };
}

function list(query = {}) {
  const filters = productFilters(query);
  const page = pageSettings(query);
  const total = db.prepare(`SELECT COUNT(*) AS count FROM products ${filters.where}`).get(filters.params).count;
  const sql = `
    SELECT * FROM products
    ${filters.where}
    ORDER BY created_at DESC, rowid DESC
    ${page.limit ? "LIMIT @limit OFFSET @offset" : ""}
  `;
  const products = db.prepare(sql).all({ ...filters.params, limit: page.limit, offset: page.offset }).map(toProduct);

  return {
    products,
    total,
    page: page.page,
    limit: page.limit
  };
}

function categories() {
  return db.prepare(`
    SELECT DISTINCT category
    FROM products
    WHERE category IS NOT NULL AND category <> ''
    ORDER BY category
  `).all().map((row) => row.category);
}

function suggestions(search) {
  const value = String(search || "").trim().toLowerCase();
  if (!value) return [];

  const rows = db.prepare(`
    SELECT name, category, tags_json
    FROM products
    WHERE lower(name || ' ' || category || ' ' || coalesce(description, '') || ' ' || coalesce(tags_json, '')) LIKE @search ESCAPE '\\'
    ORDER BY created_at DESC, rowid DESC
    LIMIT 25
  `).all({ search: `%${escapeLike(value)}%` });

  const seen = new Set();
  const values = [];

  for (const row of rows) {
    for (const candidate of [row.name, row.category, ...parseJson(row.tags_json, [])]) {
      const key = String(candidate || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      values.push(candidate);
      if (values.length >= 8) return values;
    }
  }

  return values;
}

function findById(id) {
  return toProduct(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
}

function create(product) {
  db.prepare(`
    INSERT INTO products (
      id, name, category, description, price, stock, rating, tags_json,
      image, reviews_json, created_at, updated_at
    ) VALUES (
      @id, @name, @category, @description, @price, @stock, @rating, @tagsJson,
      @image, @reviewsJson, @createdAt, @updatedAt
    )
  `).run({
    ...product,
    tagsJson: json(product.tags || [], []),
    reviewsJson: json(product.reviews || [], []),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  });
  return findById(product.id);
}

function update(id, patch) {
  const current = findById(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(`
    UPDATE products
    SET name = @name,
        category = @category,
        description = @description,
        price = @price,
        stock = @stock,
        rating = @rating,
        tags_json = @tagsJson,
        image = @image,
        reviews_json = @reviewsJson,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    ...next,
    tagsJson: json(next.tags || [], []),
    reviewsJson: json(next.reviews || [], [])
  });
  return findById(id);
}

function remove(id) {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  return result.changes > 0;
}

module.exports = {
  all,
  list,
  categories,
  suggestions,
  findById,
  create,
  update,
  remove
};
