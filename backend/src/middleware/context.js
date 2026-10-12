'use strict';
/* Adds req.id / req.ip / req.cookies and res helpers (json, ok, status, cookies). */
const crypto = require('crypto');
const zlib = require('zlib');
const config = require('../config');

function clientIp(req) {
  if (config.TRUST_PROXY) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* skip */ }
  }
  return out;
}

function context(req, res, next) {
  req.id = crypto.randomBytes(6).toString('hex');
  req.ip = clientIp(req);
  req.cookies = parseCookies(req.headers.cookie);
  req.startedAt = process.hrtime.bigint();
  res.setHeader('X-Request-Id', req.id);

  res.status = (code) => { res.statusCode = code; return res; };

  res.sendBuffer = (buf, type) => {
    if (type) res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', buf.length);
    res.end(req.method === 'HEAD' ? undefined : buf);
  };

  res.json = (obj) => {
    let buf = Buffer.from(JSON.stringify(obj));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      buf = zlib.gzipSync(buf);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.sendBuffer(buf);
  };

  res.ok = (data, message = 'OK', meta) => {
    const body = { success: true, message, data: data === undefined ? null : data };
    if (meta) body.meta = meta;
    res.json(body);
  };

  res.setCookie = (name, value, o = {}) => {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path || '/'}`];
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge)}`);
    if (o.httpOnly !== false) parts.push('HttpOnly');
    if (o.secure) parts.push('Secure');
    parts.push(`SameSite=${o.sameSite || 'Lax'}`);
    const prev = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', prev ? [].concat(prev, parts.join('; ')) : parts.join('; '));
  };
  return next();
}
module.exports = { context, clientIp };
