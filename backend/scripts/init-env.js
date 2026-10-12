'use strict';
/* Creates .env from .env.example with a freshly generated JWT_SECRET. */
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) { console.log('.env already exists — leaving it untouched.'); process.exit(0); }
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
text = text.replace(/^JWT_SECRET=.*$/m, 'JWT_SECRET=' + crypto.randomBytes(48).toString('hex'));
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('Created backend/.env with a new random JWT_SECRET. Review the other values before deploying.');
