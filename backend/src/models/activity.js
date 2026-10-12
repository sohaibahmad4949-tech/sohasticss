'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);
const toApi = (r) => ({ id: r.id, adminId: r.admin_id, admin: r.admin_label, action: r.action, entity: r.entity, entityId: r.entity_id, detail: r.detail, ip: r.ip, at: new Date(r.created_at).toISOString() });

module.exports = {
  add({ adminId, adminLabel, action, entity, entityId, detail, ip }) {
    q('INSERT INTO activity_logs (admin_id, admin_label, action, entity, entity_id, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(adminId == null ? null : adminId, adminLabel || '', action, entity || '', String(entityId || ''), String(detail || '').slice(0, 500), ip || '', Date.now());
  },
  list({ limit, offset, action }) {
    const where = action ? 'WHERE action LIKE ?' : ''; const args = action ? [action + '%'] : [];
    const total = q(`SELECT COUNT(*) c FROM activity_logs ${where}`).get(...args).c;
    const rows = q(`SELECT * FROM activity_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
    return { items: rows.map(toApi), total };
  },
  prune: (before) => q('DELETE FROM activity_logs WHERE created_at < ?').run(before).changes
};
