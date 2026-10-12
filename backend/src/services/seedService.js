'use strict';
/* First-run content. A brand-new database is filled from database/defaults.json — the same text the
   original website shipped with — so the public site looks exactly as designed before anything is
   edited. It only runs on a completely empty database (no saved content, no list items) and only once. */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const content = require('../models/content');
const collections = require('../models/collections');
const { KEYS: LIST_KEYS } = require('../models/collectionSchema');
const logger = require('../utils/logger');

const DEFAULTS_FILE = path.join(config.ROOT, 'database', 'defaults.json');
const SETTING_KEYS = ['theme', 'content', 'contactInfo', 'images', 'pages', 'seo'];
const INTERNAL = new Set(['_seeded', '_collections_rev']);

function isFresh() {
  if (content.get('_seeded')) return false;
  if (content.all().some((r) => !INTERNAL.has(r.key))) return false;
  return LIST_KEYS.every((k) => collections.count(k) === 0);
}

function seedDefaults() {
  if (!config.SEED_DEFAULTS || !isFresh() || !fs.existsSync(DEFAULTS_FILE)) return false;
  const d = JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8'));
  for (const key of LIST_KEYS) if (Array.isArray(d[key]) && d[key].length) collections.replaceAll(key, d[key]);
  for (const key of SETTING_KEYS) if (d[key] !== undefined) content.set(key, d[key], null);
  content.set('_seeded', { at: new Date().toISOString() }, null);
  logger.info('first run: default site content loaded', { source: 'database/defaults.json' });
  return true;
}
module.exports = { seedDefaults, isFresh };
