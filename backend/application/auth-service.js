const crypto = require("crypto");
const users = require("../repositories/users");
const verifications = require("../repositories/verifications");
const {
  hashPassword,
  verifyPassword,
  hashSecret,
  publicUser,
  createAuthToken
} = require("../services/store");
const { normalizePhone, sendSignupCode, sendResetCode } = require("../services/whatsapp");
const { badRequest, notFound, unauthorized } = require("../http/errors");

function isValidTimedSecret(record) {
  return Boolean(record?.expiresAt && new Date(record.expiresAt).getTime() > Date.now());
}

function sessionFor(user) {
  return { user: publicUser(user), token: createAuthToken(user) };
}

function currentUser(user) {
  return publicUser(user);
}

function updateProfile(user, body) {
  const name = String(body.name || user.name || "").trim();
  const phone = body.phone || user.phone;
  return publicUser(users.updateProfile(user.id, {
    name,
    phone,
    phoneNormalized: normalizePhone(phone) || null,
    dob: body.dob || "",
    gender: body.gender || "",
    username: body.username || "",
    bio: body.bio || ""
  }));
}

function login(body) {
  const user = users.byIdentifier(body.email || body.identifier, normalizePhone);

  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    throw unauthorized("Invalid email/phone or password.");
  }

  return sessionFor(user);
}

async function requestSignupCode(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);

  if (!email || !phone) {
    throw badRequest("Email and WhatsApp phone number are required.");
  }

  if (users.findByEmail(email)) {
    throw badRequest("Email already in use.");
  }

  const code = String(crypto.randomInt(100000, 999999));
  const verification = verifications.replaceRecentSignup({
    id: `signup_${crypto.randomBytes(8).toString("hex")}`,
    type: "signup",
    email,
    phone,
    codeHash: hashSecret(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });

  await sendSignupCode(phone, code);

  return {
    verificationId: verification.id,
    message: "Signup code sent to WhatsApp.",
    ...(process.env.NODE_ENV === "production" ? {} : { signupCode: code })
  };
}

function register(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const verification = verifications.findById(body.verificationId);

  if (!verification || verification.type !== "signup" || !isValidTimedSecret(verification)) {
    throw badRequest("Request a fresh WhatsApp signup code first.");
  }

  if (verification.email !== email || verification.phone !== phone || verification.codeHash !== hashSecret(body.code)) {
    throw badRequest("Invalid signup verification code.");
  }

  if (!body.password || String(body.password).length < 6) {
    throw badRequest("Password must be at least 6 characters.");
  }

  if (users.findByEmail(email)) {
    throw badRequest("Email already in use.");
  }

  const user = users.create({
    id: `user_${crypto.randomBytes(8).toString("hex")}`,
    name: body.name || "Customer",
    email,
    phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
    passwordHash: hashPassword(body.password),
    role: "customer",
    createdAt: new Date().toISOString()
  });

  verifications.remove(verification.id);
  return sessionFor(user);
}

async function requestPasswordReset(body) {
  const user = users.byIdentifier(body.identifier || body.email, normalizePhone);

  if (!user) throw notFound("No account found for that email or phone.");
  if (!user.phone) throw badRequest("This account has no verified WhatsApp phone number.");

  const code = String(crypto.randomInt(100000, 999999));
  users.setPasswordReset(user.id, {
    codeHash: hashSecret(code),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });

  await sendResetCode(user, code);

  return {
    message: "Reset code sent to WhatsApp.",
    ...(process.env.NODE_ENV === "production" ? {} : { resetCode: code })
  };
}

function verifyResetCode(body) {
  const user = users.byIdentifier(body.identifier || body.email, normalizePhone);

  if (!user || !isValidTimedSecret(user.passwordReset) || hashSecret(body.code) !== user.passwordReset.codeHash) {
    throw badRequest("Invalid or expired reset code.");
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  users.setPasswordReset(user.id, {
    ...user.passwordReset,
    resetTokenHash: hashSecret(resetToken),
    verifiedAt: new Date().toISOString()
  });

  return { resetToken };
}

function resetPassword(body) {
  const tokenHash = hashSecret(body.resetToken || "");
  const user = users.findByResetTokenHash(tokenHash, isValidTimedSecret);

  if (!user) throw badRequest("Invalid or expired reset token.");
  if (!body.password || String(body.password).length < 6) {
    throw badRequest("Password must be at least 6 characters.");
  }

  users.clearPasswordResetAndUpdatePassword(user.id, hashPassword(body.password));
  return { message: "Password updated." };
}

module.exports = {
  currentUser,
  updateProfile,
  login,
  requestSignupCode,
  register,
  requestPasswordReset,
  verifyResetCode,
  resetPassword
};
