const crypto = require("crypto");
const express = require("express");
const {
  readDb,
  writeDb,
  hashPassword,
  verifyPassword,
  hashSecret,
  publicUser,
  getCurrentUser,
  setCurrentUser
} = require("../services/store");
const { normalizePhone, sendSignupCode, sendResetCode } = require("../services/whatsapp");

const router = express.Router();

function isValidTimedSecret(record) {
  return Boolean(record?.expiresAt && new Date(record.expiresAt).getTime() > Date.now());
}

function findUserByIdentifier(db, identifier) {
  const value = String(identifier || "").trim().toLowerCase();
  const phone = normalizePhone(identifier);
  return (db.users || []).find((user) => (
    String(user.email || "").toLowerCase() === value ||
    normalizePhone(user.phone) === phone
  ));
}

router.get("/me", (req, res) => {
  res.json({ user: publicUser(getCurrentUser()) });
});

router.post("/login", (req, res) => {
  const db = readDb();
  const user = findUserByIdentifier(db, req.body.email || req.body.identifier);

  if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
    return res.status(401).json({ error: "Invalid email/phone or password." });
  }

  setCurrentUser(user);
  return res.json({ user: publicUser(user), token: user.id });
});

router.post("/request-signup-code", async (req, res, next) => {
  try {
    const db = readDb();
    const email = String(req.body.email || "").trim().toLowerCase();
    const phone = normalizePhone(req.body.phone);

    if (!email || !phone) {
      return res.status(400).json({ error: "Email and WhatsApp phone number are required." });
    }

    if ((db.users || []).some((user) => String(user.email || "").toLowerCase() === email)) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const code = String(crypto.randomInt(100000, 999999));
    const verification = {
      id: `signup_${crypto.randomBytes(8).toString("hex")}`,
      email,
      phone,
      codeHash: hashSecret(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    db.signupVerifications = [
      verification,
      ...(db.signupVerifications || []).filter((entry) => isValidTimedSecret(entry)).slice(0, 20)
    ];
    writeDb(db);

    await sendSignupCode(phone, code);

    return res.json({
      verificationId: verification.id,
      message: "Signup code sent to WhatsApp.",
      ...(process.env.NODE_ENV === "production" ? {} : { signupCode: code })
    });
  } catch (error) {
    next(error);
  }
});

router.post("/register", (req, res) => {
  const db = readDb();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = normalizePhone(req.body.phone);
  const verification = (db.signupVerifications || []).find((entry) => entry.id === req.body.verificationId);

  if (!verification || !isValidTimedSecret(verification)) {
    return res.status(400).json({ error: "Request a fresh WhatsApp signup code first." });
  }

  if (verification.email !== email || verification.phone !== phone || verification.codeHash !== hashSecret(req.body.code)) {
    return res.status(400).json({ error: "Invalid signup verification code." });
  }

  if (!req.body.password || String(req.body.password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  if ((db.users || []).some((user) => String(user.email || "").toLowerCase() === email)) {
    return res.status(400).json({ error: "Email already in use." });
  }

  const user = {
    id: `user_${crypto.randomBytes(8).toString("hex")}`,
    name: req.body.name || "Customer",
    email,
    phone,
    phoneVerifiedAt: new Date().toISOString(),
    passwordHash: hashPassword(req.body.password),
    role: "customer",
    createdAt: new Date().toISOString()
  };

  db.users = db.users || [];
  db.users.push(user);
  db.signupVerifications = (db.signupVerifications || []).filter((entry) => entry.id !== verification.id);
  writeDb(db);

  setCurrentUser(user);
  return res.status(201).json({ user: publicUser(user), token: user.id });
});

router.post("/logout", (req, res) => {
  setCurrentUser(null);
  res.json({ message: "Logged out successfully." });
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const db = readDb();
    const user = findUserByIdentifier(db, req.body.identifier || req.body.email);

    if (!user) return res.status(404).json({ error: "No account found for that email or phone." });
    if (!user.phone) return res.status(400).json({ error: "This account has no verified WhatsApp phone number." });

    const code = String(crypto.randomInt(100000, 999999));
    user.passwordReset = {
      codeHash: hashSecret(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };
    writeDb(db);

    await sendResetCode(user, code);

    return res.json({
      message: "Reset code sent to WhatsApp.",
      ...(process.env.NODE_ENV === "production" ? {} : { resetCode: code })
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verify-reset-code", (req, res) => {
  const db = readDb();
  const user = findUserByIdentifier(db, req.body.identifier || req.body.email);

  if (!user || !isValidTimedSecret(user.passwordReset) || hashSecret(req.body.code) !== user.passwordReset.codeHash) {
    return res.status(400).json({ error: "Invalid or expired reset code." });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordReset.resetTokenHash = hashSecret(resetToken);
  user.passwordReset.verifiedAt = new Date().toISOString();
  writeDb(db);

  return res.json({ resetToken });
});

router.post("/reset-password", (req, res) => {
  const db = readDb();
  const tokenHash = hashSecret(req.body.resetToken || "");
  const user = (db.users || []).find((entry) => (
    isValidTimedSecret(entry.passwordReset) && entry.passwordReset.resetTokenHash === tokenHash
  ));

  if (!user) return res.status(400).json({ error: "Invalid or expired reset token." });
  if (!req.body.password || String(req.body.password).length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  user.passwordHash = hashPassword(req.body.password);
  delete user.passwordReset;
  writeDb(db);

  return res.json({ message: "Password updated." });
});

module.exports = router;
