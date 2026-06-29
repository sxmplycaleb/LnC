const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const config = require("../config");

const TOKEN_TTL = "7d";
let bcrypt = null;

try {
  bcrypt = require("bcrypt");
} catch {
  bcrypt = null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const storedPassword = String(passwordHash || "");
  if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
    return Boolean(password) && Boolean(bcrypt?.compareSync(String(password), storedPassword));
  }

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
    role: user.role,
    dob: user.dob,
    gender: user.gender,
    username: user.username,
    bio: user.bio,
    phoneVerifiedAt: user.phoneVerifiedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt
  };
}

function createAuthToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

function verifyAuthToken(token) {
  return jwt.verify(token, config.jwtSecret());
}

module.exports = {
  hashPassword,
  verifyPassword,
  hashSecret,
  publicUser,
  createAuthToken,
  verifyAuthToken
};
