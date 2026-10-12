'use strict';
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
let current = levels.info;
function setLevel(name) { if (name in levels) current = levels[name]; }
function emit(level, msg, meta) {
  if (levels[level] > current) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta || {}) });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}
module.exports = {
  setLevel,
  error: (m, x) => emit('error', m, x), warn: (m, x) => emit('warn', m, x),
  info: (m, x) => emit('info', m, x), debug: (m, x) => emit('debug', m, x)
};
