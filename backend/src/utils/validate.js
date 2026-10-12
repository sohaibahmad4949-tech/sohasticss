'use strict';
/* Tiny schema validator.
   rules: { field: { type, required, min, max, trim, enum, pattern, default, multiline, nullable } }
   types: string | email | url | int | number | boolean | uuid | id | phone */
const { validation } = require('./errors');
const { cleanText } = require('./sanitize');

const EMAIL = /^[^\s@<>()[\]\\,;:]+@[^\s@<>()[\]\\,;:]+\.[A-Za-z]{2,}$/;
const PHONE = /^[0-9+()\-.\s]{5,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function isHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; }
}

function validate(input, rules, { partial = false } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {}; const errors = [];
  for (const [field, r] of Object.entries(rules)) {
    let v = src[field];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (missing) {
      if (partial && v === undefined) continue;
      if (r.required) { errors.push({ field, message: `${r.label || field} is required` }); continue; }
      if (r.default !== undefined) out[field] = r.default;
      else if (r.nullable) out[field] = null;
      else if (v !== undefined && r.type === 'string') out[field] = '';
      continue;
    }
    const label = r.label || field;
    switch (r.type) {
      case 'string': case 'email': case 'url': case 'phone': {
        if (typeof v !== 'string') { errors.push({ field, message: `${label} must be text` }); break; }
        v = cleanText(v, { multiline: !!r.multiline });
        if (r.type === 'email') { v = v.toLowerCase(); if (v.length > 254 || !EMAIL.test(v)) { errors.push({ field, message: `${label} must be a valid email address` }); break; } }
        if (r.type === 'url' && !isHttpUrl(v)) { errors.push({ field, message: `${label} must be a valid http(s) URL` }); break; }
        if (r.type === 'phone' && !PHONE.test(v)) { errors.push({ field, message: `${label} is not a valid phone number` }); break; }
        if (r.min && v.length < r.min) { errors.push({ field, message: `${label} must be at least ${r.min} characters` }); break; }
        if (r.max && v.length > r.max) { errors.push({ field, message: `${label} must be at most ${r.max} characters` }); break; }
        if (r.enum && !r.enum.includes(v)) { errors.push({ field, message: `${label} must be one of: ${r.enum.join(', ')}` }); break; }
        if (r.pattern && !r.pattern.test(v)) { errors.push({ field, message: r.patternMessage || `${label} has an invalid format` }); break; }
        out[field] = v; break;
      }
      case 'int': case 'number': {
        const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
        if (typeof n !== 'number' || !Number.isFinite(n) || (r.type === 'int' && !Number.isInteger(n))) { errors.push({ field, message: `${label} must be a ${r.type === 'int' ? 'whole ' : ''}number` }); break; }
        if (r.min !== undefined && n < r.min) { errors.push({ field, message: `${label} must be at least ${r.min}` }); break; }
        if (r.max !== undefined && n > r.max) { errors.push({ field, message: `${label} must be at most ${r.max}` }); break; }
        out[field] = n; break;
      }
      case 'boolean': {
        if (typeof v === 'boolean') out[field] = v;
        else if (v === 'true' || v === 1 || v === '1') out[field] = true;
        else if (v === 'false' || v === 0 || v === '0') out[field] = false;
        else errors.push({ field, message: `${label} must be true or false` });
        break;
      }
      case 'uuid': if (typeof v === 'string' && UUID.test(v)) out[field] = v.toLowerCase(); else errors.push({ field, message: `${label} must be a valid id` }); break;
      case 'id': if (typeof v === 'string' && ID.test(v)) out[field] = v; else errors.push({ field, message: `${label} must be a valid id` }); break;
      default: out[field] = v;
    }
  }
  if (errors.length) throw validation(errors);
  return out;
}

const isUuid = (s) => typeof s === 'string' && UUID.test(s);
function parsePage(query, { defLimit = 20, maxLimit = 100 } = {}) {
  let page = parseInt(query.page, 10); let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = defLimit;
  limit = Math.min(limit, maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}
module.exports = { validate, isUuid, isHttpUrl, parsePage, EMAIL, ID };
