const { db, json, parseJson } = require("./database");

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    role: row.role,
    passwordHash: row.password_hash,
    dob: row.dob,
    gender: row.gender,
    username: row.username,
    bio: row.bio,
    phoneVerifiedAt: row.phone_verified_at,
    emailVerifiedAt: row.email_verified_at,
    passwordReset: parseJson(row.password_reset_json, null),
    createdAt: row.created_at
  };
}

function byIdentifier(identifier, normalizePhone) {
  const value = String(identifier || "").trim().toLowerCase();
  const phone = normalizePhone(identifier);
  return toUser(db.prepare(`
    SELECT * FROM users
    WHERE lower(email) = ?
       OR (phone_normalized IS NOT NULL AND phone_normalized = ?)
    LIMIT 1
  `).get(value, phone || null));
}

function findById(id) {
  return toUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

function findByEmail(email) {
  return toUser(db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email));
}

function create(user) {
  db.prepare(`
    INSERT INTO users (
      id, email, name, phone, phone_normalized, role, password_hash, dob, gender, username, bio,
      phone_verified_at, email_verified_at, password_reset_json, reset_token_hash, reset_expires_at, created_at
    ) VALUES (
      @id, @email, @name, @phone, @phoneNormalized, @role, @passwordHash, @dob, @gender, @username, @bio,
      @phoneVerifiedAt, @emailVerifiedAt, @passwordResetJson, @resetTokenHash, @resetExpiresAt, @createdAt
    )
  `).run({
    ...user,
    phone: user.phone || null,
    phoneNormalized: user.phoneNormalized || user.phone || null,
    dob: user.dob || null,
    gender: user.gender || null,
    username: user.username || null,
    bio: user.bio || null,
    phoneVerifiedAt: user.phoneVerifiedAt || null,
    emailVerifiedAt: user.emailVerifiedAt || null,
    passwordResetJson: json(user.passwordReset),
    resetTokenHash: user.passwordReset?.resetTokenHash || null,
    resetExpiresAt: user.passwordReset?.expiresAt || null,
    createdAt: user.createdAt || new Date().toISOString()
  });
  return findById(user.id);
}

function updateProfile(userId, profile) {
  db.prepare(`
    UPDATE users
    SET name = @name,
        phone = @phone,
        phone_normalized = @phoneNormalized,
        dob = @dob,
        gender = @gender,
        username = @username,
        bio = @bio
    WHERE id = @id
  `).run({ id: userId, ...profile });
  return findById(userId);
}

function setPasswordReset(userId, passwordReset) {
  db.prepare(`
    UPDATE users
    SET password_reset_json = ?,
        reset_token_hash = ?,
        reset_expires_at = ?
    WHERE id = ?
  `).run(json(passwordReset), passwordReset?.resetTokenHash || null, passwordReset?.expiresAt || null, userId);
  return findById(userId);
}

function clearPasswordResetAndUpdatePassword(userId, passwordHash) {
  db.prepare(`
    UPDATE users
    SET password_hash = ?,
        password_reset_json = NULL,
        reset_token_hash = NULL,
        reset_expires_at = NULL
    WHERE id = ?
  `).run(passwordHash, userId);
  return findById(userId);
}

function findByResetTokenHash(tokenHash, isValidTimedSecret) {
  const user = toUser(db.prepare(`
    SELECT * FROM users
    WHERE reset_token_hash = ?
      AND reset_expires_at > ?
    LIMIT 1
  `).get(tokenHash, new Date().toISOString()));

  return isValidTimedSecret(user?.passwordReset) ? user : null;
}

module.exports = {
  byIdentifier,
  findById,
  findByEmail,
  create,
  updateProfile,
  setPasswordReset,
  clearPasswordResetAndUpdatePassword,
  findByResetTokenHash
};
