'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);
const toApi = (r) => r && ({ id: r.id, kind: r.kind, type: r.kind, filename: r.filename, originalName: r.original_name, mime: r.mime, size: r.size, url: r.url, createdAt: new Date(r.created_at).toISOString() });

module.exports = {
  toApi,
  create(m) {
    q('INSERT INTO media (id, kind, filename, original_name, mime, size, sha256, url, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(m.id, m.kind, m.filename, m.originalName, m.mime, m.size, m.sha256 || '', m.url, m.createdBy == null ? null : m.createdBy, Date.now());
    return toApi(q('SELECT * FROM media WHERE id = ?').get(m.id));
  },
  get: (id) => toApi(q('SELECT * FROM media WHERE id = ?').get(id)),
  findBySha: (sha) => toApi(q('SELECT * FROM media WHERE sha256 = ? LIMIT 1').get(sha)),
  list({ limit, offset, kind }) {
    const where = kind === 'image' || kind === 'video' ? 'WHERE kind = ?' : '';
    const args = where ? [kind] : [];
    const total = q(`SELECT COUNT(*) c FROM media ${where}`).get(...args).c;
    const rows = q(`SELECT * FROM media ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { items: rows.map(toApi), total };
  },
  remove: (id) => q('DELETE FROM media WHERE id = ?').run(id).changes,
  stats() { const r = q('SELECT COUNT(*) c, COALESCE(SUM(size),0) s FROM media').get(); return { count: r.c, bytes: r.s }; }
};
