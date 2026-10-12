'use strict';
const crypto = require('crypto');
const db = require('./db');
const q = (sql) => db.get().prepare(sql);

const toApi = (r) => ({ id: r.id, name: r.name, rating: r.rating, message: r.message, approved: !!r.approved, submittedAt: new Date(r.created_at).toISOString(), createdAt: new Date(r.created_at).toISOString() });

module.exports = {
  create({ name, rating, message }) {
    const id = 'rev_' + crypto.randomBytes(8).toString('hex'); const now = Date.now();
    q('INSERT INTO reviews (id, name, rating, message, approved, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(id, name, rating, message, now, now);
    return toApi(q('SELECT * FROM reviews WHERE id = ?').get(id));
  },
  list: ({ approvedOnly }) => q(`SELECT * FROM reviews ${approvedOnly ? 'WHERE approved = 1' : ''} ORDER BY created_at DESC LIMIT 500`).all().map(toApi),
  get: (id) => { const r = q('SELECT * FROM reviews WHERE id = ?').get(id); return r ? toApi(r) : null; },
  setApproved: (id, approved) => q('UPDATE reviews SET approved = ?, updated_at = ? WHERE id = ?').run(approved ? 1 : 0, Date.now(), id).changes,
  remove: (id) => q('DELETE FROM reviews WHERE id = ?').run(id).changes,
  /* Admin "sync": upsert the given list; delete rows missing from it but only
     if they existed before `knownBefore` (so a review that arrived after the
     admin loaded the list is never deleted by a stale save). */
  sync(items, knownBefore) {
    return db.tx(() => {
      const present = new Set();
      const now = Date.now();
      for (const it of items) {
        present.add(it.id);
        const exists = q('SELECT id FROM reviews WHERE id = ?').get(it.id);
        if (exists) q('UPDATE reviews SET name = ?, rating = ?, message = ?, approved = ?, updated_at = ? WHERE id = ?').run(it.name, it.rating, it.message, it.approved ? 1 : 0, now, it.id);
        else q('INSERT INTO reviews (id, name, rating, message, approved, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(it.id, it.name, it.rating, it.message, it.approved ? 1 : 0, it.createdAt || now, now);
      }
      let removed = 0;
      for (const r of q('SELECT id, created_at FROM reviews').all()) {
        if (!present.has(r.id) && r.created_at <= knownBefore) { q('DELETE FROM reviews WHERE id = ?').run(r.id); removed++; }
      }
      return { removed };
    });
  },
  counts() { const r = q('SELECT COUNT(*) total, COALESCE(SUM(approved = 0),0) pending FROM reviews').get(); return { total: r.total, pending: r.pending }; },
  version() { const r = q('SELECT COUNT(*) c, COALESCE(MAX(updated_at),0) m FROM reviews WHERE approved = 1').get(); return r.c + ':' + r.m; }
};
