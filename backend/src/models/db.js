'use strict';
/* SQLite connection (Node's built-in node:sqlite) + versioned migrations. */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { SCHEMAS, KEYS: COLLECTION_KEYS, createTableSql } = require('./collectionSchema');

// node:sqlite is flagged "experimental" in some Node 22 releases; silence only that notice.
const origEmit = process.emitWarning;
process.emitWarning = function (w, ...rest) {
  const text = typeof w === 'string' ? w : (w && w.message) || '';
  if (/SQLite is an experimental feature/i.test(text)) return;
  return origEmit.call(process, w, ...rest);
};
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch (e) { throw new Error('This backend needs Node.js 22.5 or newer (built-in node:sqlite). Current: ' + process.version); }
process.emitWarning = origEmit;

let db = null;

function open() {
  if (db) return db;
  if (config.DATABASE_FILE !== ':memory:') fs.mkdirSync(path.dirname(config.DATABASE_FILE), { recursive: true });
  db = new DatabaseSync(config.DATABASE_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate();
  return db;
}

const MIGRATIONS = [
  {
    version: 1, name: 'initial schema',
    sql: `
    CREATE TABLE admins (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name   TEXT NOT NULL DEFAULT '',
      password_hash  TEXT NOT NULL,
      role           TEXT NOT NULL DEFAULT 'admin',
      status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until   INTEGER NOT NULL DEFAULT 0,
      last_login_at  INTEGER,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE site_content (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      updated_by INTEGER REFERENCES admins(id) ON DELETE SET NULL
    );

    CREATE TABLE messages (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT NOT NULL DEFAULT '',
      subject      TEXT NOT NULL DEFAULT '',
      project_type TEXT NOT NULL DEFAULT '',
      budget       TEXT NOT NULL DEFAULT '',
      message      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read')),
      ip_hash      TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX idx_messages_created ON messages(created_at DESC);
    CREATE INDEX idx_messages_status  ON messages(status, created_at DESC);

    CREATE TABLE reviews (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      message    TEXT NOT NULL,
      approved   INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_reviews_approved ON reviews(approved, created_at DESC);

    CREATE TABLE media (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL CHECK (kind IN ('image','video')),
      filename      TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL DEFAULT '',
      mime          TEXT NOT NULL,
      size          INTEGER NOT NULL,
      sha256        TEXT NOT NULL DEFAULT '',
      url           TEXT NOT NULL,
      created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX idx_media_created ON media(created_at DESC);
    CREATE INDEX idx_media_kind    ON media(kind, created_at DESC);
    CREATE INDEX idx_media_sha     ON media(sha256);

    CREATE TABLE activity_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      admin_label TEXT NOT NULL DEFAULT '',
      action      TEXT NOT NULL,
      entity      TEXT NOT NULL DEFAULT '',
      entity_id   TEXT NOT NULL DEFAULT '',
      detail      TEXT NOT NULL DEFAULT '',
      ip          TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
    CREATE INDEX idx_activity_action  ON activity_logs(action, created_at DESC);

    CREATE TABLE analytics_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      page        TEXT,
      sid         TEXT NOT NULL,
      ref         TEXT,
      device      TEXT,
      browser     TEXT,
      evt         TEXT,
      label       TEXT,
      new_session INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_events_ts  ON analytics_events(ts DESC);
    CREATE INDEX idx_events_sid ON analytics_events(sid);
    CREATE INDEX idx_events_evt ON analytics_events(evt, ts DESC);

    CREATE TABLE analytics_heartbeats (
      sid    TEXT PRIMARY KEY,
      last   INTEGER NOT NULL,
      page   TEXT,
      device TEXT
    );
    CREATE INDEX idx_heartbeats_last ON analytics_heartbeats(last);

    CREATE TABLE revoked_tokens (
      jti        TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX idx_revoked_exp ON revoked_tokens(expires_at);
    `
  },
  {
    /* The six list-type sections (portfolio, websites, services, awards, milestones, skills) become real
       tables with typed columns, ordering, published flag and timestamps. Anything previously saved as a
       JSON document in site_content is imported, then removed from site_content. */
    version: 2, name: 'collections as tables',
    sql: COLLECTION_KEYS.map((k) => createTableSql(SCHEMAS[k])).join('\n'),
    run() {
      const collections = require('./collections');
      for (const key of COLLECTION_KEYS) {
        const row = db.prepare('SELECT value FROM site_content WHERE key = ?').get(key);
        if (!row) continue;
        let list = [];
        try { list = JSON.parse(row.value); } catch (e) { list = []; }
        const seen = new Set();
        const items = (Array.isArray(list) ? list : []).filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id && !seen.has(it.id) && seen.add(it.id));
        collections.replaceAll(key, items);
        db.prepare('DELETE FROM site_content WHERE key = ?').run(key);
        logger.info('imported collection into table', { key, rows: items.length });
      }
    }
  }
];

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    tx(() => {
      db.exec(m.sql);
      if (m.run) m.run();
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
    });
    logger.info('migration applied', { version: m.version, name: m.name });
  }
}

/* Run fn inside a transaction (re-entrant: nested calls join the outer one). */
let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ } throw e; }
  finally { depth--; }
}

const get = () => open();
function close() { if (db) { try { db.close(); } catch (e) { /* ignore */ } db = null; } }
module.exports = { open, get, tx, close };
