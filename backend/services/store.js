const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_FILE = path.join(__dirname, "..", "..", "db.json");

let currentUser = null;

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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
  const original = Buffer.from(originalHash, "hex");
  const test = Buffer.from(testHash, "hex");

  return original.length === test.length && crypto.timingSafeEqual(original, test);
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role
  };
}

function getCurrentUser() {
  return currentUser;
}

function setCurrentUser(user) {
  currentUser = user || null;
}

function getBearerUser(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return currentUser;

  const db = readDb();
  return (db.users || []).find((user) => user.id === token) || currentUser;
}

function requireSignedIn(req, res) {
  const user = getBearerUser(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = getBearerUser(req);
  if (user?.role !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return null;
  }
  return user;
}

module.exports = {
  readDb,
  writeDb,
  hashPassword,
  verifyPassword,
  hashSecret,
  publicUser,
  getCurrentUser,
  setCurrentUser,
  getBearerUser,
  requireSignedIn,
  requireAdmin
};
