'use strict';
const crypto = require('crypto');
const db = require('./db');
const q = (sql) => db.get().prepare(sql);

const toApi = (r) => r && ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, subject: r.subject,
  projectType: r.project_type, budget: r.budget, message: r.message,
  status: r.status, read: r.status === 'read',
  submittedAt: new Date(r.created_at).toISOString(),
  createdAt: new Date(r.created_at).toISOString()
});

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function where({ q: search, status, projectType }) {
  const parts = []; const args = [];
  if (projectType) { parts.push('project_type = ?'); args.push(String(projectType).slice(0, 60)); }
  if (status === 'read' || status === 'unread') { parts.push('status = ?'); args.push(status); }
  if (search) {
    const like = '%' + escapeLike(search) + '%';
    parts.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\' OR project_type LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\')");
    args.push(like, like, like, like, like);
  }
  return { sql: parts.length ? 'WHERE ' + parts.join(' AND ') : '', args };
}

module.exports = {
  toApi,
  create(m) {
    const id = crypto.randomUUID(); const now = Date.now();
    q(`INSERT INTO messages (id, name, email, phone, subject, project_type, budget, message, status, ip_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?, ?)`)
      .run(id, m.name, m.email, m.phone || '', m.subject || '', m.projectType || '', m.budget || '', m.message, m.ipHash || '', now, now);
    return toApi(q('SELECT * FROM messages WHERE id = ?').get(id));
  },
  list({ page, limit, offset, q: search, status, projectType }) {
    const w = where({ q: search, status, projectType });
    const total = q(`SELECT COUNT(*) c FROM messages ${w.sql}`).get(...w.args).c;
    const rows = q(`SELECT * FROM messages ${w.sql} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).all(...w.args, limit, offset);
    return { items: rows.map(toApi), total };
  },
  get: (id) => toApi(q('SELECT * FROM messages WHERE id = ?').get(id)),
  setStatus(id, status) { return q('UPDATE messages SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id).changes; },
  markAllRead() { return q("UPDATE messages SET status = 'read', updated_at = ? WHERE status = 'unread'").run(Date.now()).changes; },
  remove: (id) => q('DELETE FROM messages WHERE id = ?').run(id).changes,
  removeAll: () => q('DELETE FROM messages').run().changes,
  counts() {
    const r = q("SELECT COUNT(*) total, COALESCE(SUM(status = 'unread'), 0) unread FROM messages").get();
    return { total: r.total, unread: r.unread };
  },
  /* Figures for the admin "Contact Messages" header: totals, breakdowns and a gap-free 14-day trend.
     tzMin = the admin's UTC offset in minutes, so "today" matches their calendar. */
  stats(tzMin = 0) {
    const now = Date.now(); const day = 86400000;
    const c = this.counts();
    const since = (ms) => q('SELECT COUNT(*) c FROM messages WHERE created_at >= ?').get(now - ms).c;
    const tally = (col) => Object.fromEntries(q(`SELECT ${col} k, COUNT(*) c FROM messages WHERE ${col} <> '' GROUP BY ${col}`).all().map((r) => [r.k, r.c]));
    const perDay = new Map(q("SELECT date((created_at + ?) / 1000, 'unixepoch') d, COUNT(*) c FROM messages WHERE created_at >= ? GROUP BY d").all(tzMin * 60000, now - 31 * day).map((r) => [r.d, r.c]));
    const daily = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(now + tzMin * 60000 - i * day).toISOString().slice(0, 10); daily.push({ date: d, count: perDay.get(d) || 0 }); }
    return { total: c.total, unread: c.unread, week: since(7 * day), month: since(30 * day), byType: tally('project_type'), byBudget: tally('budget'), daily };
  },
  recent: (n) => q('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?').all(n).map(toApi),
  version() { const r = q('SELECT COUNT(*) c, COALESCE(MAX(updated_at),0) m FROM messages').get(); return r.c + ':' + r.m; }
};
