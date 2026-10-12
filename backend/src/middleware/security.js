'use strict';
/* Secure HTTP headers + CORS + same-site request guard. */
const config = require('../config');
const { forbidden } = require('../utils/errors');

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.removeHeader('X-Powered-By');
  if (config.isProd && (config.COOKIE_SECURE || req.headers['x-forwarded-proto'] === 'https')) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.url.startsWith('/api/')) {
    // JSON API: nothing in a response should ever be rendered or framed.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
  }
  return next();
}

const allowed = new Set(config.CORS_ORIGINS);
// Development only: let the site be opened from a file, Live Server, etc. while the API runs on :3000.
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
function originAllowed(origin, req) {
  if (!origin) return true;
  if (!config.isProd && (origin === 'null' || DEV_ORIGIN.test(origin))) return true;
  if (allowed.has(origin.replace(/\/+$/, ''))) return true;
  // same-origin requests (site served by this backend)
  const host = req.headers.host;
  return !!host && (origin === `http://${host}` || origin === `https://${host}`);
}

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin, req)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '600');
      res.statusCode = 204;
      return res.end();
    }
  } else if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  return next();
}

/* CSRF defence for cookie-authenticated routes: a foreign Origin is refused and
   a custom header is required (browsers cannot add it cross-site without a
   CORS preflight, which only allowed origins pass). */
function requireSameSite(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin, req)) throw forbidden('Cross-site request refused', { code: 'CSRF_ORIGIN' });
  if (!req.headers['x-requested-with']) throw forbidden('Missing X-Requested-With header', { code: 'CSRF_HEADER' });
  return next();
}
module.exports = { securityHeaders, cors, requireSameSite, originAllowed };
