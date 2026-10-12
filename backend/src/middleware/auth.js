'use strict';
const config = require('../config');
const jwt = require('../utils/jwt');
const admins = require('../models/admins');
const tokens = require('../models/tokens');
const { unauthorized } = require('../utils/errors');
const crypto = require('crypto');
const passwordVersion = (a) => crypto.createHash('sha256').update(a.password_hash).digest('hex').slice(0, 12);

/* Resolve the admin for this request (or null). Never throws. */
function resolveAdmin(req) {
  const token = req.cookies[config.COOKIE_NAME];
  if (!token) return null;
  const p = jwt.verify(token, config.JWT_SECRET);
  if (!p || !p.sub || !p.jti || tokens.isRevoked(p.jti)) return null;
  const admin = admins.findById(Number(p.sub));
  if (!admin || admin.status !== 'active') return null;
  if (p.pv !== passwordVersion(admin)) return null;   // password changed since this session began
  req.session = { jti: p.jti, exp: p.exp };
  return admin;
}

function optionalAuth(req, res, next) { req.admin = resolveAdmin(req); return next(); }
function requireAuth(req, res, next) {
  const admin = resolveAdmin(req);
  if (!admin) throw unauthorized('Please sign in to continue');
  req.admin = admin;
  return next();
}
module.exports = { optionalAuth, requireAuth, resolveAdmin, passwordVersion };
