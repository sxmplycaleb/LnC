const path = require("path");

function numberFromEnv(name, fallback, { min, max } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);

  if (!Number.isFinite(value)) return fallback;
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production" && !secret) {
    throw new Error("JWT_SECRET must be set in production.");
  }

  return secret || "development-only-secret";
}

const rootDir = path.join(__dirname, "..");

module.exports = {
  rootDir,
  port: numberFromEnv("PORT", 3000, { min: 1, max: 65535 }),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "12mb",
  sqliteFile: process.env.SQLITE_DB_FILE || path.join(rootDir, "data", "commerce.sqlite"),
  sqliteBusyTimeoutMs: numberFromEnv("SQLITE_BUSY_TIMEOUT_MS", 5000, { min: 0 }),
  productQueryLimit: numberFromEnv("PRODUCT_QUERY_LIMIT", 250, { min: 1, max: 1000 }),
  jwtSecret
};
