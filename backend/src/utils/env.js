'use strict';
/* Minimal .env loader (no dependencies). Existing environment variables win. */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const target = file || path.join(__dirname, '..', '..', '.env');
  let raw;
  try { raw = fs.readFileSync(target, 'utf8'); } catch (e) { return false; }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, '');
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
  return true;
}
module.exports = { loadEnv };
