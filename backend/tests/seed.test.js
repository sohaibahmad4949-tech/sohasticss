'use strict';
/* A brand-new database starts with the website's original content; an edited one is never overwritten. */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sohastics-seed-'));
process.env.DATABASE_URL = 'file:' + path.join(tmp, 'seed.sqlite');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads'); process.env.LOG_LEVEL = 'error'; process.env.NODE_ENV = 'test';

const db = require('../src/models/db');
const collections = require('../src/models/collections');
const content = require('../src/models/content');
const { seedDefaults } = require('../src/services/seedService');
after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('empty database is filled once from defaults.json', () => {
  db.open();
  assert.equal(seedDefaults(), true);
  assert.equal(collections.count('services'), 4);
  assert.equal(collections.count('awards'), 3);
  assert.equal(collections.count('milestones'), 5);
  assert.equal(collections.count('skills'), 5);
  assert.equal(content.get('theme').value, 'charcoal-orange');
  assert.equal(content.get('content').value.home.heroRoleLeft, 'Web Developer');
  assert.equal(content.get('pages').value.websites, true);
  assert.equal(content.get('submissions'), null, 'no placeholder messages are created');
  assert.equal(collections.list('services')[0].title, 'Website Development');
});

test('seeding never runs twice and never overwrites edits', () => {
  assert.equal(seedDefaults(), false);
  collections.remove('services', collections.list('services')[0].id);
  collections.replaceAll('awards', []);
  assert.equal(seedDefaults(), false);
  assert.equal(collections.count('services'), 3); assert.equal(collections.count('awards'), 0);
});
