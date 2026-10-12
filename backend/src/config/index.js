'use strict';
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('../utils/env');
loadEnv();

const ROOT = path.resolve(__dirname, '..', '..');
const env = process.env;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== '' ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const resolveDir = (p, d) => path.resolve(ROOT, p || d);

const NODE_ENV = env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const PORT = num(env.PORT, 3000);
const FRONTEND_URL = (env.FRONTEND_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

let JWT_SECRET = env.JWT_SECRET || '';
let ephemeralSecret = false;
if (!JWT_SECRET || JWT_SECRET.length < 32 || /change[-_ ]?me|your[-_ ]secret/i.test(JWT_SECRET)) {
  if (isProd) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production (run: npm run init).');
  }
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  ephemeralSecret = true;
}

// DATABASE_URL accepts "file:./database/x.sqlite", a plain path, or ":memory:".
function dbPath() {
  let u = env.DATABASE_URL || 'file:./database/sohastics.sqlite';
  if (u === ':memory:') return u;
  u = u.replace(/^(sqlite|file):(\/\/)?/, '');
  return path.resolve(ROOT, u);
}

const corsOrigins = (env.CORS_ORIGINS || FRONTEND_URL).split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);

module.exports = {
  ROOT, NODE_ENV, isProd, PORT,
  HOST: env.HOST || '0.0.0.0',
  FRONTEND_URL,
  PUBLIC_URL: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  CORS_ORIGINS: corsOrigins,
  SERVE_FRONTEND: bool(env.SERVE_FRONTEND, true),
  FRONTEND_DIR: resolveDir(env.FRONTEND_DIR, '../frontend'),
  DATABASE_FILE: dbPath(),
  UPLOAD_DIR: resolveDir(env.UPLOAD_DIR, 'uploads'),
  JWT_SECRET, EPHEMERAL_SECRET: ephemeralSecret,
  SESSION_HOURS: num(env.SESSION_HOURS, 12),
  COOKIE_NAME: 'sohastics_session',
  COOKIE_SAMESITE: (env.COOKIE_SAMESITE || 'Lax'),
  COOKIE_SECURE: bool(env.COOKIE_SECURE, isProd),
  TRUST_PROXY: bool(env.TRUST_PROXY, false),
  MAX_IMAGE_MB: num(env.MAX_IMAGE_MB, 8),
  MAX_VIDEO_MB: num(env.MAX_VIDEO_MB, 100),
  SEED_DEFAULTS: bool(env.SEED_DEFAULTS, true),
  RATE_LIMIT_ENABLED: bool(env.RATE_LIMIT_ENABLED, true),
  LOG_LEVEL: env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  ADMIN_EMAIL: env.ADMIN_EMAIL || '',
  ADMIN_USERNAME: env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  CONTENT_NS: 'ahmedCMS_'
};
