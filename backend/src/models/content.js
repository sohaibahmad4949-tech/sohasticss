'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);

module.exports = {
  all() {
    return q('SELECT key, value, updated_at FROM site_content').all().map((r) => ({ key: r.key, value: JSON.parse(r.value), updatedAt: r.updated_at }));
  },
  get(key) {
    const r = q('SELECT value, updated_at FROM site_content WHERE key = ?').get(key);
    return r ? { value: JSON.parse(r.value), updatedAt: r.updated_at } : null;
  },
  set(key, value, adminId) {
    q(`INSERT INTO site_content (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .run(key, JSON.stringify(value), Date.now(), adminId == null ? null : adminId);
  },
  remove: (key) => q('DELETE FROM site_content WHERE key = ?').run(key).changes,
  maxUpdated: () => (q('SELECT MAX(updated_at) m FROM site_content').get().m || 0),
  allJsonText: () => q('SELECT value FROM site_content').all().map((r) => r.value).join('\n')
};
