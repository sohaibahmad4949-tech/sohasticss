'use strict';
const crypto = require('crypto');
const config = require('../config');
const admins = require('../models/admins');
const tokens = require('../models/tokens');
const jwt = require('../utils/jwt');
const logger = require('../utils/logger');
const { hashPassword, verifyPassword, verifyDummy, checkPasswordStrength } = require('../utils/password');
const { AppError, unauthorized, validation, conflict } = require('../utils/errors');
const { passwordVersion } = require('../middleware/auth');
const { log } = require('./activityService');

const LOCK_AFTER = 5; const LOCK_MS = 15 * 60 * 1000;

function startSession(res, admin) {
  const ttl = config.SESSION_HOURS * 3600;
  const token = jwt.sign({ sub: String(admin.id), jti: crypto.randomUUID(), pv: passwordVersion(admin) }, config.JWT_SECRET, ttl);
  res.setCookie(config.COOKIE_NAME, token, { maxAge: ttl, secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAMESITE });
}

async function login(req, res, { identifier, password }) {
  const admin = admins.findByIdentifier(identifier);
  if (!admin || admin.status !== 'active') {
    await verifyDummy(password);
    log(req, 'auth.login_failed', 'admin', '', `unknown account "${String(identifier).slice(0, 60)}"`, { id: null, username: '' });
    throw unauthorized('Incorrect email/username or password', { code: 'INVALID_CREDENTIALS' });
  }
  if (admin.locked_until > Date.now()) {
    const mins = Math.ceil((admin.locked_until - Date.now()) / 60000);
    throw new AppError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, { code: 'ACCOUNT_LOCKED' });
  }
  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) {
    const failures = admin.failed_attempts + 1;
    admins.recordFailure(admin.id, failures % LOCK_AFTER === 0 ? Date.now() + LOCK_MS : 0);
    log(req, 'auth.login_failed', 'admin', admin.id, 'wrong password', admin);
    throw unauthorized('Incorrect email/username or password', { code: 'INVALID_CREDENTIALS' });
  }
  admins.recordSuccess(admin.id);
  startSession(res, admin);
  log(req, 'auth.login', 'admin', admin.id, 'signed in', admin);
  return admins.publicAdmin(admins.findById(admin.id));
}

function logout(req, res) {
  if (req.session) tokens.revoke(req.session.jti, req.session.exp);
  res.setCookie(config.COOKIE_NAME, '', { maxAge: 0, secure: config.COOKIE_SECURE, sameSite: config.COOKIE_SAMESITE });
  if (req.admin) log(req, 'auth.logout', 'admin', req.admin.id, 'signed out');
}

async function changePassword(req, res, { currentPassword, newPassword }) {
  const admin = admins.findById(req.admin.id);
  if (!(await verifyPassword(currentPassword, admin.password_hash))) {
    throw validation([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  const problems = checkPasswordStrength(newPassword);
  if (problems.length) throw validation([{ field: 'newPassword', message: 'New password needs ' + problems.join(', ') }]);
  if (newPassword === currentPassword) throw validation([{ field: 'newPassword', message: 'New password must be different' }]);
  admins.updatePassword(admin.id, await hashPassword(newPassword));
  const fresh = admins.findById(admin.id);
  if (req.session) tokens.revoke(req.session.jti, req.session.exp);
  startSession(res, fresh);                       // keep this browser signed in; every other session is invalidated
  log(req, 'auth.password_changed', 'admin', admin.id, 'password changed');
}

async function updateProfile(req, { currentPassword, email, username, displayName }) {
  const admin = admins.findById(req.admin.id);
  if (!(await verifyPassword(currentPassword, admin.password_hash))) {
    throw validation([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  const next = { email: email || admin.email, username: username || admin.username, displayName: displayName || admin.display_name };
  for (const [col, val] of [['email', next.email], ['username', next.username]]) {
    const other = admins.findByIdentifier(val);
    if (other && other.id !== admin.id) throw conflict(`That ${col} is already in use`);
  }
  admins.updateProfile(admin.id, next);
  log(req, 'auth.profile_updated', 'admin', admin.id, 'profile updated');
  return admins.publicAdmin(admins.findById(admin.id));
}

async function createAdmin({ email, username, password, displayName }) {
  const problems = checkPasswordStrength(password);
  if (problems.length) throw validation([{ field: 'password', message: 'Password needs ' + problems.join(', ') }]);
  return admins.create({ email: email.toLowerCase(), username, displayName, passwordHash: await hashPassword(password) });
}

/* On first start, create the admin from ADMIN_* env vars if no admin exists. */
async function seedFromEnv() {
  if (admins.count() > 0) return false;
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    logger.warn('No admin account exists yet. Run "npm run admin:create" (or set ADMIN_EMAIL / ADMIN_PASSWORD in .env).');
    return false;
  }
  await createAdmin({ email: config.ADMIN_EMAIL, username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD });
  logger.info('Admin account created from environment', { email: config.ADMIN_EMAIL });
  return true;
}
module.exports = { login, logout, changePassword, updateProfile, createAdmin, seedFromEnv };
