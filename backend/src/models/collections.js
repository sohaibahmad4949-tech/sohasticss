'use strict';
/* Data access for the list-type content (projects, websites, services, awards, milestones, skills).
   Each collection is its own SQL table; items are converted to/from the JSON shape the website uses. */
const db = require('./db');
const content = require('./content');
const { SCHEMAS, RESERVED } = require('./collectionSchema');

const q = (sql) => db.get().prepare(sql);
const schemaOf = (key) => { const s = SCHEMAS[key]; if (!s) throw new Error('Unknown collection ' + key); return s; };
const iso = (ms) => new Date(ms).toISOString();

function toItem(schema, r) {
  let extra = {};
  try { extra = JSON.parse(r.extra || '{}'); } catch (e) { /* ignore corrupt extra */ }
  const item = { ...extra, id: r.id };
  for (const [field, { col, type }] of Object.entries(schema.cols)) {
    const v = r[col];
    item[field] = type === 'bool' ? !!v : type === 'int' ? Number(v) : (type === 'nullable' ? (v == null ? null : v) : v);
  }
  item.published = !!r.published;
  item.createdAt = iso(r.created_at);
  item.updatedAt = iso(r.updated_at);
  return item;
}

/* JSON item -> column values (+ extra). `base` supplies values for fields the item doesn't mention. */
function toRow(schema, item, base) {
  const row = {}; const extra = {};
  for (const [field, { col, type }] of Object.entries(schema.cols)) {
    let v = item[field];
    if (v === undefined) v = base ? base[col] : undefined;
    if (type === 'bool') row[col] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0;
    else if (type === 'int') { const n = Number(v); row[col] = Number.isFinite(n) ? Math.round(n) : 0; }
    else if (type === 'nullable') row[col] = v == null || v === '' ? null : String(v);
    else row[col] = v == null ? '' : String(v);
  }
  for (const [k, v] of Object.entries(item)) {
    if (RESERVED.has(k) || k in schema.cols) continue;
    extra[k] = v;
  }
  const pub = item.published;
  row.published = pub === undefined ? (base ? base.published : 1) : (pub === false || pub === 0 || pub === '0' || pub === 'false' ? 0 : 1);
  row.extra = Object.keys(extra).length ? JSON.stringify(extra) : '{}';
  return row;
}

const colNames = (schema) => Object.values(schema.cols).map((c) => c.col);
const sameRow = (schema, a, b) => [...colNames(schema), 'published', 'extra'].every((c) => a[c] === b[c]);

function bumpRevision() { content.set('_collections_rev', { n: Date.now() + '-' + Math.random().toString(36).slice(2, 8) }, null); }

module.exports = {
  list(key, { publishedOnly = false } = {}) {
    const s = schemaOf(key);
    const rows = q(`SELECT * FROM ${s.table} ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY position ASC, created_at DESC`).all();
    return rows.map((r) => toItem(s, r));
  },
  get(key, id) {
    const s = schemaOf(key);
    const r = q(`SELECT * FROM ${s.table} WHERE id = ?`).get(id);
    return r ? toItem(s, r) : null;
  },
  counts(key) {
    const s = schemaOf(key);
    const r = q(`SELECT COUNT(*) total, COALESCE(SUM(published = 1), 0) published, COALESCE(SUM(published = 0), 0) draft FROM ${s.table}`).get();
    return { total: r.total, published: r.published, draft: r.draft };
  },
  count: (key) => q(`SELECT COUNT(*) c FROM ${schemaOf(key).table}`).get().c,
  featuredCount(key) {
    const s = schemaOf(key); if (!s.cols.featured) return 0;
    return q(`SELECT COUNT(*) c FROM ${s.table} WHERE featured = 1`).get().c;
  },
  recent(key, n) {
    const s = schemaOf(key);
    return q(`SELECT * FROM ${s.table} ORDER BY updated_at DESC, position ASC LIMIT ?`).all(n).map((r) => toItem(s, r));
  },

  /* New item goes to the end of the list, exactly like "Add New" in the admin panel
     (the website treats the last items as the newest). */
  insertLast(key, item) {
    const s = schemaOf(key);
    return db.tx(() => {
      const pos = q(`SELECT COALESCE(MAX(position), -1) + 1 p FROM ${s.table}`).get().p;
      const row = toRow(s, item, null);
      const now = Date.now();
      const names = [...colNames(s), 'published', 'extra'];
      q(`INSERT INTO ${s.table} (id, position, ${names.join(', ')}, created_at, updated_at) VALUES (?, ?, ${names.map(() => '?').join(', ')}, ?, ?)`)
        .run(item.id, pos, ...names.map((n) => row[n]), now, now);
      bumpRevision();
      return this.get(key, item.id);
    });
  },

  update(key, id, patch) {
    const s = schemaOf(key);
    return db.tx(() => {
      const cur = q(`SELECT * FROM ${s.table} WHERE id = ?`).get(id);
      if (!cur) return null;
      // Keep unknown fields that were saved earlier unless the patch overrides them.
      let prevExtra = {}; try { prevExtra = JSON.parse(cur.extra || '{}'); } catch (e) { /* ignore */ }
      const row = toRow(s, { ...prevExtra, ...patch }, cur);
      const names = [...colNames(s), 'published', 'extra'];
      q(`UPDATE ${s.table} SET ${names.map((n) => n + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`).run(...names.map((n) => row[n]), Date.now(), id);
      bumpRevision();
      return this.get(key, id);
    });
  },

  remove(key, id) {
    const s = schemaOf(key);
    return db.tx(() => {
      const n = q(`DELETE FROM ${s.table} WHERE id = ?`).run(id).changes;
      if (n) { this.compact(key); bumpRevision(); }
      return n;
    });
  },

  compact(key) {
    const s = schemaOf(key);
    const ids = q(`SELECT id FROM ${s.table} ORDER BY position ASC, created_at DESC`).all();
    const up = q(`UPDATE ${s.table} SET position = ? WHERE id = ?`);
    ids.forEach((r, i) => up.run(i, r.id));
  },

  reorder(key, ids) {
    const s = schemaOf(key);
    return db.tx(() => {
      const up = q(`UPDATE ${s.table} SET position = ? WHERE id = ?`);
      ids.forEach((id, i) => up.run(i, id));
      bumpRevision();
    });
  },

  /* Make the table match `items` exactly (used when the admin panel saves a whole list):
     rows are added, changed, re-ordered or removed inside one transaction. */
  replaceAll(key, items) {
    const s = schemaOf(key);
    return db.tx(() => {
      const existing = new Map(q(`SELECT * FROM ${s.table}`).all().map((r) => [r.id, r]));
      const names = [...colNames(s), 'published', 'extra'];
      const insert = q(`INSERT INTO ${s.table} (id, position, ${names.join(', ')}, created_at, updated_at) VALUES (?, ?, ${names.map(() => '?').join(', ')}, ?, ?)`);
      const update = q(`UPDATE ${s.table} SET position = ?, ${names.map((n) => n + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`);
      const move = q(`UPDATE ${s.table} SET position = ? WHERE id = ?`);
      const now = Date.now();
      const keep = new Set();
      items.forEach((item, i) => {
        keep.add(item.id);
        const cur = existing.get(item.id);
        if (!cur) {
          const row = toRow(s, item, null);
          const created = Date.parse(item.createdAt);
          insert.run(item.id, i, ...names.map((n) => row[n]), Number.isFinite(created) ? created : now, now);
        } else {
          const row = toRow(s, item, cur);
          if (sameRow(s, row, cur)) { if (cur.position !== i) move.run(i, item.id); }
          else update.run(i, ...names.map((n) => row[n]), now, item.id);
        }
      });
      let removed = 0;
      for (const id of existing.keys()) if (!keep.has(id)) { q(`DELETE FROM ${s.table} WHERE id = ?`).run(id); removed++; }
      bumpRevision();
      return { removed };
    });
  },

  /* Used by the "is this uploaded file still referenced?" check. */
  searchText(needle) {
    for (const s of Object.values(SCHEMAS)) {
      const textCols = Object.values(s.cols).filter((c) => c.type === 'text' || c.type === 'nullable').map((c) => c.col).concat('extra');
      const where = textCols.map((c) => `instr(${c}, ?) > 0`).join(' OR ');
      if (q(`SELECT 1 FROM ${s.table} WHERE ${where} LIMIT 1`).get(...textCols.map(() => needle))) return true;
    }
    return false;
  },
  maxUpdated() {
    let m = 0;
    for (const s of Object.values(SCHEMAS)) { const r = q(`SELECT COALESCE(MAX(updated_at),0) m FROM ${s.table}`).get(); if (r.m > m) m = r.m; }
    return m;
  }
};
