'use strict';
/* Create the first admin, or reset an existing admin's password.
   Interactive:   npm run admin:create
   Scripted:      ADMIN_EMAIL=me@x.com ADMIN_USERNAME=me ADMIN_PASSWORD='long-secret-1' npm run admin:create */
const readline = require('readline');
const db = require('../src/models/db');
const admins = require('../src/models/admins');
const authService = require('../src/services/authService');
const { hashPassword, checkPasswordStrength } = require('../src/utils/password');
const { EMAIL } = require('../src/utils/validate');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question); else if (s === '\r\n' || s === '\n') process.stdout.write('\n'); };
    }
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

(async () => {
  db.open();
  let email = process.env.ADMIN_EMAIL; let username = process.env.ADMIN_USERNAME; let password = process.env.ADMIN_PASSWORD;
  const interactive = process.stdin.isTTY;
  if (!email && interactive) email = await ask('Admin email: ');
  if (!email || !EMAIL.test(email)) { console.error('A valid ADMIN_EMAIL is required.'); process.exit(1); }
  if (!username && interactive) username = (await ask('Username [admin]: ')) || 'admin';
  username = username || 'admin';
  if (!password && interactive) password = await ask('Password (min 10 chars, letters + numbers): ', { hidden: true });
  const problems = checkPasswordStrength(password || '');
  if (problems.length) { console.error('Password needs ' + problems.join(', ') + '.'); process.exit(1); }

  const existing = admins.findByIdentifier(email) || admins.findByIdentifier(username);
  if (existing) {
    admins.updatePassword(existing.id, await hashPassword(password));
    console.log(`Password updated for existing admin "${existing.username}" (${existing.email}).`);
  } else {
    const a = await authService.createAdmin({ email, username, password });
    console.log(`Admin created: ${a.username} (${a.email}).`);
  }
  db.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
