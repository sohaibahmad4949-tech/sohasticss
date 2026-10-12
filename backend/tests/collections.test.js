'use strict';
/* Collections live in real SQL tables: migration from the old JSON documents, ordering, drafts,
   unknown-field preservation, admin-panel endpoints (stats, system, filters). */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sohastics-coll-'));
process.env.DATABASE_URL = 'file:' + path.join(tmp, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.PORT = '0'; process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_ENABLED = 'false'; process.env.LOG_LEVEL = 'error';
process.env.NODE_ENV = 'test'; process.env.SEED_DEFAULTS = 'false'; process.env.SERVE_FRONTEND = 'false';
process.env.ADMIN_EMAIL = 'owner@example.com'; process.env.ADMIN_USERNAME = 'owner'; process.env.ADMIN_PASSWORD = 'Test-pass-12345';

const db = require('../src/models/db');
const collections = require('../src/models/collections');
const content = require('../src/models/content');

/* ---- 1. migration: a database created before collections became tables keeps its data ---- */
test('migration imports old JSON documents into tables and removes them from site_content', () => {
  const conn = db.open();
  // Put the database back into its "version 1" shape and write the old-style documents.
  for (const t of ['projects', 'websites', 'services', 'awards', 'milestones', 'skills']) conn.exec(`DROP TABLE ${t}`);
  conn.exec('DELETE FROM schema_migrations WHERE version = 2');
  const old = [
    { id: 'p_old1', title: 'Old Project', category: 'reels', desc: 'first', tc: 'HTML', tone: 'blue', image: null, video: '', featured: true, customField: 'keep me' },
    { id: 'p_old2', title: 'Hidden Project', category: 'color', desc: '', tc: '', tone: 'orange', image: '/uploads/images/x.png', published: false },
    { id: 'p_old1', title: 'Duplicate id is skipped' },
    { title: 'No id is skipped' }
  ];
  content.set('portfolio', old, null);
  content.set('skills', [{ id: 'sk1', name: 'Node', value: 90 }], null);
  content.set('theme', 'midnight-blue', null);
  db.close();

  db.open();                                            // re-open => migration 2 runs again
  const list = collections.list('portfolio');
  assert.deepEqual(list.map((p) => p.id), ['p_old1', 'p_old2'], 'order preserved, bad entries skipped');
  assert.equal(list[0].featured, true); assert.equal(list[0].customField, 'keep me', 'unknown fields survive in extra');
  assert.equal(list[0].published, true); assert.equal(list[1].published, false);
  assert.equal(collections.get('skills', 'sk1').value, 90);
  assert.equal(content.get('portfolio'), null, 'old document removed');
  assert.equal(content.get('theme').value, 'midnight-blue', 'non-list settings are untouched');
  assert.equal(db.get().prepare('SELECT COUNT(*) c FROM schema_migrations WHERE version = 2').get().c, 1);
});

test('replaceAll: add, change, reorder, remove — untouched rows keep their timestamps', async () => {
  const before = collections.list('portfolio');
  await new Promise((r) => setTimeout(r, 5));
  const p1 = { ...before[0] }; const p2 = { ...before[1], title: 'Renamed' };
  collections.replaceAll('portfolio', [p2, p1, { id: 'p_new', title: 'Brand new', category: 'reels' }]);
  const after = collections.list('portfolio');
  assert.deepEqual(after.map((p) => p.id), ['p_old2', 'p_old1', 'p_new']);
  assert.equal(after[1].updatedAt, before[0].updatedAt, 'unchanged row: updatedAt not bumped');
  assert.notEqual(after[0].updatedAt, before[1].updatedAt, 'changed row: updatedAt bumped');
  assert.equal(after[0].createdAt, before[1].createdAt, 'createdAt never changes');
  assert.equal(after[0].title, 'Renamed'); assert.equal(after[0].published, false, 'omitted published keeps its value');
  collections.replaceAll('portfolio', [p1]);
  assert.deepEqual(collections.list('portfolio').map((p) => p.id), ['p_old1'], 'missing rows are deleted');
  assert.deepEqual(collections.counts('portfolio'), { total: 1, published: 1, draft: 0 });
});

/* ---- HTTP level ---- */
const config = require('../src/config');
const { start } = require('../src/server');
let server; let base; let cookie = '';
async function api(method, url, body, opts = {}) {
  const headers = {};
  if (cookie && !opts.noCookie) headers.cookie = cookie;
  if (method !== 'GET') headers['x-requested-with'] = 'test';
  let payload;
  if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const sc = res.headers.get('set-cookie'); if (sc && !opts.noCookie) cookie = sc.split(';')[0];
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* ignore */ }
  return { status: res.status, json };
}
before(async () => { db.close(); server = await start(); base = 'http://127.0.0.1:' + server.address().port; await api('POST', '/api/auth/login', { identifier: 'owner', password: 'Test-pass-12345' }); });
after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('drafts: hidden from every public endpoint, visible to the admin, counted separately', async () => {
  const c = await api('POST', '/api/admin/services', { title: 'Live service', price: '10' });
  const d = await api('POST', '/api/admin/services', { title: 'Draft service', published: false });
  assert.equal(c.status, 201); assert.equal(d.json.data.published, false);
  const pub = (await api('GET', '/api/services', undefined, { noCookie: true })).json.data.map((s) => s.title);
  assert.deepEqual(pub, ['Live service']);
  assert.equal((await api('GET', '/api/services/' + d.json.data.id, undefined, { noCookie: true })).status, 404);
  const feed = (await api('GET', '/api/content', undefined, { noCookie: true })).json.data.items.find((i) => i.key === 'services').value;
  assert.deepEqual(feed.map((s) => s.title), ['Live service']);
  const adminFeed = (await api('GET', '/api/admin/content')).json.data.items.find((i) => i.key === 'services').value;
  assert.equal(adminFeed.length, 2);
  assert.deepEqual((await api('GET', '/api/admin/dashboard')).json.data.counts.services, { total: 2, published: 1, draft: 1 });
  // publish it
  assert.equal((await api('PUT', '/api/admin/services/' + d.json.data.id, { published: true })).json.data.published, true);
  assert.equal((await api('GET', '/api/services', undefined, { noCookie: true })).json.data.length, 2);
});

test('API inserts append (same as the admin panel) and persist ordering', async () => {
  const titles = (await api('GET', '/api/services', undefined, { noCookie: true })).json.data.map((s) => s.title);
  assert.deepEqual(titles, ['Live service', 'Draft service']);
  const n = await api('POST', '/api/admin/services', { title: 'Third' });
  const all = (await api('GET', '/api/admin/services')).json.data;
  assert.equal(all[all.length - 1].id, n.json.data.id);
  await api('DELETE', '/api/admin/services/' + all[0].id);
  assert.deepEqual((await api('GET', '/api/admin/services')).json.data.map((s) => s.title), ['Draft service', 'Third']);
});

test('whole-list save from the admin panel keeps unknown fields and is validated', async () => {
  const list = [{ id: 'aw_x', year: '2024', title: 'Award', org: 'Org', desc: 'd', icon: 'trophy', badgeColor: 'gold' }];
  const r = await api('PUT', '/api/admin/content/awards', { value: list });
  assert.equal(r.status, 200); assert.equal(r.json.data.value[0].badgeColor, 'gold');
  assert.equal((await api('PUT', '/api/admin/content/awards', { value: [{ id: 'a', title: 'x' }, { id: 'a', title: 'dup' }] })).status, 422);
  assert.equal((await api('PUT', '/api/admin/content/awards', { value: [{ id: 'bad id!' }] })).status, 422);
  assert.equal((await api('GET', '/api/awards', undefined, { noCookie: true })).json.data[0].badgeColor, 'gold');
});

test('uploaded files used by a collection row are protected from deletion', async () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const p = await api('POST', '/api/admin/projects', { title: 'With image', image: 'data:image/png;base64,' + PNG.toString('base64') });
  assert.match(p.json.data.image, /^\/uploads\//);
  const media = (await api('GET', '/api/admin/media')).json.data;
  const m = media.find((x) => x.url === p.json.data.image);
  assert.equal(m.inUse, true); assert.equal(m.type, 'image');
  const del = await api('DELETE', '/api/admin/media/' + m.id);
  assert.equal(del.status, 400); assert.equal(del.json.error, 'MEDIA_IN_USE');
});

test('admin panel endpoints: message stats + filters, system info, activity shape', async () => {
  for (const [name, type] of [['Ann', 'reels'], ['Bob', 'color'], ['Cy', 'reels']]) {
    await api('POST', '/api/messages', { name, email: name.toLowerCase() + '@example.com', projectType: type, budget: 'not-sure', message: 'Hello from ' + name + ', please call me.' }, { noCookie: true });
  }
  const st = (await api('GET', '/api/admin/messages/stats?tz=300')).json.data;
  assert.equal(st.total, 3); assert.equal(st.unread, 3); assert.equal(st.week, 3); assert.equal(st.month, 3);
  assert.deepEqual(st.byType, { reels: 2, color: 1 }); assert.equal(st.byBudget['not-sure'], 3);
  assert.equal(st.daily.length, 14); assert.equal(st.daily.reduce((s, d) => s + d.count, 0), 3);
  assert.match(st.daily[0].date, /^\d{4}-\d{2}-\d{2}$/);

  const f = (await api('GET', '/api/admin/messages?projectType=reels&limit=10')).json;
  assert.deepEqual(f.data.map((m) => m.name).sort(), ['Ann', 'Cy']); assert.equal(f.meta.total, 2);
  assert.ok(f.data[0].createdAt && f.data[0].read === false);

  const sys = (await api('GET', '/api/admin/system')).json.data;
  assert.equal(sys.database.ok, true); assert.ok(sys.node && sys.siteUrl);
  assert.equal((await api('GET', '/api/admin/system', undefined, { noCookie: true })).status, 401);
  assert.equal((await api('GET', '/api/admin/messages/stats', undefined, { noCookie: true })).status, 401);

  const dash = (await api('GET', '/api/admin/dashboard')).json.data;
  assert.equal(dash.counts.messages.unread, 3); assert.ok(dash.recentMessages[0].createdAt);
  assert.ok(dash.recentActivity.length && dash.recentActivity[0].createdAt && 'adminName' in dash.recentActivity[0]);
});

test('profile changes need the current password', async () => {
  const bad = await api('PATCH', '/api/auth/profile', { email: 'new@example.com', currentPassword: 'nope-nope-1' });
  assert.ok(bad.status === 401 || bad.status === 403 || bad.status === 422, 'rejected: ' + bad.status);
  const ok = await api('PATCH', '/api/auth/profile', { email: 'new@example.com', currentPassword: 'Test-pass-12345' });
  assert.equal(ok.status, 200); assert.equal(ok.json.data.user.email, 'new@example.com');
});
