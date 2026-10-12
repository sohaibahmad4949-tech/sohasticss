'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);
const plain = (r) => (r ? { ...r } : null);

const publicAdmin = (a) => a && ({ id: a.id, email: a.email, username: a.username, displayName: a.display_name, role: a.role, lastLoginAt: a.last_login_at });

module.exports = {
  publicAdmin,
  count: () => q('SELECT COUNT(*) c FROM admins').get().c,
  findById: (id) => plain(q('SELECT * FROM admins WHERE id = ?').get(id)),
  findByIdentifier: (ident) => plain(q('SELECT * FROM admins WHERE email = ? OR username = ?').get(ident, ident)),
  create({ email, username, displayName, passwordHash }) {
    const now = Date.now();
    const r = q(`INSERT INTO admins (email, username, display_name, password_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)`).run(email, username, displayName || username, passwordHash, now, now);
    return plain(q('SELECT * FROM admins WHERE id = ?').get(Number(r.lastInsertRowid)));
  },
  updatePassword(id, hash) {
    q('UPDATE admins SET password_hash = ?, failed_attempts = 0, locked_until = 0, updated_at = ? WHERE id = ?').run(hash, Date.now(), id);
  },
  updateProfile(id, { email, username, displayName }) {
    q('UPDATE admins SET email = ?, username = ?, display_name = ?, updated_at = ? WHERE id = ?').run(email, username, displayName, Date.now(), id);
  },
  recordFailure(id, lockUntil) {
    q('UPDATE admins SET failed_attempts = failed_attempts + 1, locked_until = ? WHERE id = ?').run(lockUntil || 0, id);
  },
  recordSuccess(id) {
    q('UPDATE admins SET failed_attempts = 0, locked_until = 0, last_login_at = ? WHERE id = ?').run(Date.now(), id);
  }
};
