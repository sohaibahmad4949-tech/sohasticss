'use strict';
/* HS256 JSON Web Tokens using Node's crypto. */
const crypto = require('crypto');
const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payload, secret, expiresInSec) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const data = head + '.' + b64u(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

function verify(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}
module.exports = { sign, verify };
