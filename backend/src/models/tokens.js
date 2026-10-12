'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);
module.exports = {
  revoke: (jti, exp) => q('INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)').run(jti, exp * 1000),
  isRevoked: (jti) => !!q('SELECT 1 x FROM revoked_tokens WHERE jti = ?').get(jti),
  prune: () => q('DELETE FROM revoked_tokens WHERE expires_at < ?').run(Date.now())
};
