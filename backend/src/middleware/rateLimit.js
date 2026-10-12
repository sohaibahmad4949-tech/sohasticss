'use strict';
/* In-memory sliding-window limiter (per process). */
const config = require('../config');
const { AppError } = require('../utils/errors');

const buckets = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) { if (v.reset <= now) buckets.delete(k); }
}, 60000).unref();

function rateLimit({ name, windowMs, max, message }) {
  return function limiter(req, res, next) {
    if (!config.RATE_LIMIT_ENABLED) return next();
    const key = name + ':' + req.ip;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    const remaining = Math.max(0, max - b.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((b.reset - now) / 1000)));
    if (b.count > max) {
      const retry = Math.ceil((b.reset - now) / 1000);
      throw new AppError(429, message || 'Too many requests, please try again later', { code: 'RATE_LIMITED', headers: { 'Retry-After': String(retry) } });
    }
    return next();
  };
}
const reset = () => buckets.clear();
module.exports = { rateLimit, reset };
