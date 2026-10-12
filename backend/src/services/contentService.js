'use strict';
/* Site content (the CMS documents) + REST collections built on top of them. */
const crypto = require('crypto');
const content = require('../models/content');
const collections = require('../models/collections');
const { BY_KEY: TABLE_KEYS } = require('../models/collectionSchema');
const reviews = require('../models/reviews');
const media = require('./mediaService');
const { validate, ID } = require('../utils/validate');
const { isDangerousUrl } = require('../utils/sanitize');
const { validation, notFound, conflict, badRequest } = require('../utils/errors');
const db = require('../models/db');

/* Which documents exist and what top-level shape each must have. */
const KEYS = {
  theme: 'string', content: 'object', services: 'array', awards: 'array', portfolio: 'array', milestones: 'array',
  skills: 'array', contactInfo: 'object', images: 'object', pages: 'object', websites: 'array', seo: 'object'
};
const PUBLIC_KEYS = Object.keys(KEYS);

const MAX_DEPTH = 8; const MAX_STRING = 20000; const MAX_ITEMS = 500;

function deepCheck(v, path, depth, errors) {
  if (depth > MAX_DEPTH) { errors.push({ field: path, message: 'Nested too deeply' }); return; }
  if (typeof v === 'string') {
    if (v.length > MAX_STRING) errors.push({ field: path, message: `Text is too long (max ${MAX_STRING} characters)` });
    else if (isDangerousUrl(v)) errors.push({ field: path, message: 'Unsafe link/script content is not allowed' });
  } else if (Array.isArray(v)) {
    if (v.length > MAX_ITEMS) errors.push({ field: path, message: `Too many items (max ${MAX_ITEMS})` });
    v.slice(0, MAX_ITEMS).forEach((x, i) => deepCheck(x, `${path}[${i}]`, depth + 1, errors));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') { errors.push({ field: path, message: 'Reserved property name' }); continue; }
      deepCheck(x, path + '.' + k, depth + 1, errors);
    }
  } else if (typeof v === 'number' && !Number.isFinite(v)) errors.push({ field: path, message: 'Invalid number' });
}

function shapeCheck(key, value) {
  const kind = KEYS[key];
  const errors = [];
  if (kind === 'string') { if (typeof value !== 'string' || !/^[a-z0-9-]{1,40}$/.test(value)) errors.push({ field: key, message: 'Must be a short identifier like "midnight-blue"' }); }
  else if (kind === 'array') {
    if (!Array.isArray(value)) errors.push({ field: key, message: 'Must be a list' });
    else value.forEach((it, i) => {
      if (!it || typeof it !== 'object' || Array.isArray(it)) errors.push({ field: `${key}[${i}]`, message: 'Each entry must be an object' });
      else if (typeof it.id !== 'string' || !ID.test(it.id)) errors.push({ field: `${key}[${i}].id`, message: 'Each entry needs a valid id' });
    });
    if (Array.isArray(value)) {
      const ids = value.map((x) => x && x.id);
      if (new Set(ids).size !== ids.length) errors.push({ field: key, message: 'Duplicate ids in list' });
    }
  } else if (kind === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push({ field: key, message: 'Must be an object' }); }
  if (!errors.length) deepCheck(value, key, 0, errors);
  if (errors.length) throw validation(errors.slice(0, 20));
}

function diffSummary(key, before, after) {
  if (Array.isArray(before) && Array.isArray(after)) {
    const b = new Map(before.map((x) => [x.id, JSON.stringify(x)])); const a = new Map(after.map((x) => [x.id, JSON.stringify(x)]));
    let added = 0; let removed = 0; let edited = 0;
    for (const [id, j] of a) { if (!b.has(id)) added++; else if (b.get(id) !== j) edited++; }
    for (const id of b.keys()) if (!a.has(id)) removed++;
    const reordered = !added && !removed && !edited && before.map((x) => x.id).join() !== after.map((x) => x.id).join();
    const parts = [added && `${added} added`, edited && `${edited} edited`, removed && `${removed} removed`, reordered && 'reordered'].filter(Boolean);
    return parts.length ? parts.join(', ') : 'saved (no changes)';
  }
  return JSON.stringify(before) === JSON.stringify(after) ? 'saved (no changes)' : 'updated';
}

const isTable = (key) => Object.prototype.hasOwnProperty.call(TABLE_KEYS, key);

async function save(key, rawValue, admin) {
  if (!KEYS[key]) throw notFound(`Unknown content section "${key}"`);
  const value = await media.externalizeDataUris(rawValue, admin && admin.id);
  shapeCheck(key, value);
  if (isTable(key)) {
    const prev = collections.list(key);
    collections.replaceAll(key, value);
    const next = collections.list(key);
    return { value: next, summary: diffSummary(key, prev, next) };
  }
  const prev = content.get(key);
  content.set(key, value, admin && admin.id);
  return { value, summary: diffSummary(key, prev ? prev.value : (KEYS[key] === 'array' ? [] : null), value) };
}

/* ---------------------------------------------------------------- reads */
function version() { return crypto.createHash('sha1').update(content.maxUpdated() + '|' + collections.maxUpdated() + '|' + reviews.version()).digest('hex').slice(0, 16); }

function allForClient({ isAdmin }) {
  const items = content.all().filter((r) => KEYS[r.key] && !isTable(r.key)).map((r) => ({ key: r.key, value: r.value }));
  for (const key of Object.keys(TABLE_KEYS)) items.push({ key, value: collections.list(key, { publishedOnly: !isAdmin }) });
  items.push({ key: 'reviews', value: reviews.list({ approvedOnly: !isAdmin }) });
  return { version: version(), serverTime: Date.now(), items };
}

function getValue(key, fallback) {
  if (isTable(key)) return collections.list(key);
  const r = content.get(key); return r ? r.value : fallback;
}

/* --------------------------------------------------------- collections */
const COLLECTIONS = {
  projects: { key: 'portfolio', prefix: 'p', rules: {
    title: { type: 'string', required: true, max: 150, label: 'Title' }, category: { type: 'string', max: 50 }, desc: { type: 'string', max: 1000, multiline: true },
    tc: { type: 'string', max: 100 }, tone: { type: 'string', max: 30 }, image: { type: 'string', max: 2000, nullable: true }, video: { type: 'string', max: 2000 }, featured: { type: 'boolean', default: false }, published: { type: 'boolean', default: true } } },
  websites: { key: 'websites', prefix: 'ws', rules: {
    title: { type: 'string', required: true, max: 150, label: 'Title' }, category: { type: 'string', max: 50 }, price: { type: 'string', max: 20 }, desc: { type: 'string', max: 1000, multiline: true },
    video: { type: 'string', max: 2000 }, image: { type: 'string', max: 2000, nullable: true }, featured: { type: 'boolean', default: false }, published: { type: 'boolean', default: true } } },
  services: { key: 'services', prefix: 'svc', rules: {
    title: { type: 'string', required: true, max: 150, label: 'Title' }, desc: { type: 'string', max: 1000, multiline: true }, price: { type: 'string', max: 20 }, unit: { type: 'string', max: 30 }, icon: { type: 'string', max: 30 }, published: { type: 'boolean', default: true } } },
  awards: { key: 'awards', prefix: 'aw', rules: {
    title: { type: 'string', required: true, max: 150, label: 'Title' }, year: { type: 'string', max: 20 }, org: { type: 'string', max: 150 }, desc: { type: 'string', max: 1000, multiline: true }, icon: { type: 'string', max: 30 }, published: { type: 'boolean', default: true } } },
  milestones: { key: 'milestones', prefix: 'ms', rules: {
    title: { type: 'string', required: true, max: 150, label: 'Title' }, year: { type: 'string', max: 40 }, desc: { type: 'string', max: 1000, multiline: true }, icon: { type: 'string', max: 30 }, published: { type: 'boolean', default: true } } },
  skills: { key: 'skills', prefix: 'sk', rules: {
    name: { type: 'string', required: true, max: 100, label: 'Name' }, value: { type: 'int', required: true, min: 0, max: 100, label: 'Level' }, published: { type: 'boolean', default: true } } }
};

const newId = (prefix) => prefix + '_' + crypto.randomBytes(5).toString('hex');
function collection(name) { const c = COLLECTIONS[name]; if (!c) throw notFound('Unknown collection'); return c; }
const list = (name) => collections.list(collection(name).key);

function find(name, id) { const it = collections.get(collection(name).key, id); if (!it) throw notFound('Item not found'); return it; }

function publicList(name, { featured, category, q } = {}) {
  let items = collections.list(collection(name).key, { publishedOnly: true }).map((it, i) => ({ ...it, order: i + 1 }));
  if (featured === '1' || featured === 'true') items = items.filter((x) => x.featured);
  if (category) items = items.filter((x) => x.category === category);
  if (q) { const s = q.toLowerCase(); items = items.filter((x) => JSON.stringify(x).toLowerCase().includes(s)); }
  return items;
}

async function createItem(name, body, admin) {
  const c = collection(name);
  const data = validate(await media.externalizeDataUris(body, admin.id), c.rules);
  const id = body.id && ID.test(body.id) && !collections.get(c.key, body.id) ? body.id : newId(c.prefix);
  return collections.insertLast(c.key, { id, ...data });               // appended, same as "Add New" in the admin panel
}

async function updateItem(name, id, body, admin) {
  const c = collection(name);
  if (!collections.get(c.key, id)) throw notFound('Item not found');
  const data = validate(await media.externalizeDataUris(body, admin.id), c.rules, { partial: true });
  return collections.update(c.key, id, data);
}

async function deleteItem(name, id) {
  const c = collection(name);
  if (!collections.remove(c.key, id)) throw notFound('Item not found');
}

async function reorder(name, ids) {
  const c = collection(name);
  if (!Array.isArray(ids)) throw badRequest('"ids" must be a list');
  const existing = collections.list(c.key).map((x) => x.id);
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((i) => !existing.includes(i))) {
    throw conflict('The ordering must list every existing item exactly once');
  }
  collections.reorder(c.key, ids);
}

module.exports = { KEYS, PUBLIC_KEYS, COLLECTIONS, save, version, allForClient, getValue, publicList, find, createItem, updateItem, deleteItem, reorder, list };
