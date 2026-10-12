'use strict';
/* Password hashing with scrypt (built into Node). Format:
   scrypt$N$r$p$saltB64$hashB64 */
const crypto = require('crypto');
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password, salt, n, r, p, len) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, len, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P, KEYLEN);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), +n, +r, +p, expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (e) { return false; }
}

/* Used to burn the same time when the account does not exist, so response
   timing doesn't reveal which usernames are valid. */
let dummy = null;
async function verifyDummy(password) {
  if (!dummy) dummy = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
  return false;
}

function checkPasswordStrength(pw) {
  const problems = [];
  if (typeof pw !== 'string' || pw.length < 10) problems.push('at least 10 characters');
  if (pw && pw.length > 200) problems.push('at most 200 characters');
  if (!/[a-z]/i.test(pw || '')) problems.push('a letter');
  if (!/[0-9]/.test(pw || '')) problems.push('a number');
  return problems;
}
module.exports = { hashPassword, verifyPassword, verifyDummy, checkPasswordStrength };
