'use strict';
/* Input sanitising. Output encoding is still the real XSS defence (the
   admin UI escapes text), but we never store markup or control characters
   from public forms. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TAGS = /<\/?[a-zA-Z!][^>]*>/g;

function cleanText(value, { multiline = false, maxLen } = {}) {
  let s = String(value == null ? '' : value).normalize('NFC').replace(CONTROL, '');
  s = s.replace(TAGS, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  else s = s.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  s = s.trim();
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html|data:application)/i;
const isDangerousUrl = (s) => typeof s === 'string' && DANGEROUS_URL.test(s);

module.exports = { cleanText, isDangerousUrl };
