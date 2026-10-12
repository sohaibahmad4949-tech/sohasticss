'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sohastics-test-'));
process.env.DATABASE_URL = 'file:' + path.join(tmp, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.PORT = '0'; process.env.HOST = '127.0.0.1';
process.env.RATE_LIMIT_ENABLED = 'false'; process.env.LOG_LEVEL = 'error';
process.env.NODE_ENV = 'test'; process.env.SEED_DEFAULTS = 'false'; process.env.SERVE_FRONTEND = 'true';
process.env.FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
process.env.ADMIN_EMAIL = 'owner@example.com'; process.env.ADMIN_USERNAME = 'owner'; process.env.ADMIN_PASSWORD = 'Test-pass-12345';

const config = require('../src/config');
const { start } = require('../src/server');
const rl = require('../src/middleware/rateLimit');
const db = require('../src/models/db');

let server; let base; let cookie = '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const dataUri = 'data:image/png;base64,' + PNG.toString('base64');

async function api(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie && !opts.noCookie) headers.cookie = cookie;
  if (method !== 'GET' && !opts.noCsrf) headers['x-requested-with'] = 'test';
  let payload = body;
  if (body !== undefined && !(body instanceof FormData)) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
  const sc = res.headers.get('set-cookie');
  if (sc && opts.keepCookie !== false && !opts.noCookie) { const c = sc.split(';')[0]; cookie = c.endsWith('=') ? '' : c; }
  let json = null; const text = await res.text();
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, headers: res.headers, json, text };
}
const login = (id = 'owner', pw = 'Test-pass-12345') => api('POST', '/api/auth/login', { identifier: id, password: pw });

before(async () => { server = await start(); base = 'http://127.0.0.1:' + server.address().port; });
after(() => { server.closeAllConnections(); server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('health + security headers + consistent envelope', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200); assert.equal(r.json.success, true);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(r.headers.get('x-powered-by'), null);
  const nf = await api('GET', '/api/nope');
  assert.equal(nf.status, 404); assert.equal(nf.json.success, false); assert.ok(nf.json.error);
});

test('admin routes need authentication', async () => {
  for (const [m, u] of [['GET', '/api/admin/dashboard'], ['GET', '/api/admin/messages'], ['PUT', '/api/admin/content/theme'], ['POST', '/api/admin/media'], ['GET', '/api/auth/me']]) {
    const r = await api(m, u, m === 'GET' ? undefined : {}, { noCookie: true });
    assert.equal(r.status, 401, `${m} ${u}`);
  }
});

test('login: wrong password, unknown user, success, session, logout', async () => {
  assert.equal((await login('owner', 'wrong-password-1')).status, 401);
  assert.equal((await login('ghost', 'Test-pass-12345')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { identifier: 'owner' })).status, 422);
  const ok = await login('owner@example.com');                       // email works too
  assert.equal(ok.status, 200); assert.equal(ok.json.data.user.username, 'owner');
  const sc = ok.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.equal(JSON.stringify(ok.json).includes('password'), false);
  const me = await api('GET', '/api/auth/me'); assert.equal(me.status, 200);
  const old = cookie;
  assert.equal((await api('POST', '/api/auth/logout')).status, 200);
  assert.equal((await api('GET', '/api/auth/me', undefined, { headers: { cookie: old }, noCookie: true })).status, 401, 'logged-out token must be revoked');
  assert.equal((await login()).status, 200);
});

test('CSRF guards on cookie-authenticated writes', async () => {
  const noHeader = await api('PUT', '/api/admin/content/theme', { value: 'midnight-blue' }, { noCsrf: true });
  assert.equal(noHeader.status, 403);
  const foreign = await api('PUT', '/api/admin/content/theme', { value: 'midnight-blue' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(foreign.status, 403);
  const pre = await fetch(base + '/api/admin/content/theme', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'PUT' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
});

test('account lock-out after repeated failures', async () => {
  const authService = require('../src/services/authService');
  await authService.createAdmin({ email: 'second@example.com', username: 'second', password: 'Second-pass-123' });
  for (let i = 0; i < 5; i++) assert.equal((await login('second', 'bad-password-' + i)).status, 401);
  const locked = await login('second', 'Second-pass-123');
  assert.equal(locked.status, 429); assert.equal(locked.json.error, 'ACCOUNT_LOCKED');
  assert.equal((await login()).status, 200);
});

test('content: validation, save, public read, ETag, version', async () => {
  assert.equal((await api('PUT', '/api/admin/content/nonsense', { value: [] })).status, 404);
  assert.equal((await api('PUT', '/api/admin/content/services', { value: 'x' })).status, 422);
  const bad = await api('PUT', '/api/admin/content/contactInfo', { value: { instagram: 'javascript:alert(1)' } });
  assert.equal(bad.status, 422);
  assert.equal((await api('PUT', '/api/admin/content/services', { value: [{ title: 'no id' }] })).status, 422);

  const v0 = (await api('GET', '/api/content/version', undefined, { noCookie: true })).json.data.version;
  const svc = [{ id: 'svc1', icon: 'film', title: 'Website Development', desc: 'Custom sites', price: '300', unit: '/project' }];
  const save = await api('PUT', '/api/admin/content/services', { value: svc });
  assert.equal(save.status, 200);
  const pub = await api('GET', '/api/content', undefined, { noCookie: true });
  const got = pub.json.data.items.find((i) => i.key === 'services').value;
  assert.equal(got.length, 1);
  for (const k of ['id', 'icon', 'title', 'desc', 'price', 'unit']) assert.equal(got[0][k], svc[0][k], k);
  assert.equal(got[0].published, true); assert.ok(got[0].createdAt && got[0].updatedAt);
  assert.notEqual(pub.json.data.version, v0);
  const etag = pub.headers.get('etag');
  assert.equal((await api('GET', '/api/content', undefined, { noCookie: true, headers: { 'if-none-match': etag } })).status, 304);
  await api('PUT', '/api/admin/content/theme', { value: 'midnight-blue' });
  assert.equal((await api('GET', '/api/settings', undefined, { noCookie: true })).json.data.theme, 'midnight-blue');
});

test('embedded images become files, de-duplicated, served with Range support', async () => {
  const r = await api('PUT', '/api/admin/content/images', { value: { homePhoto: dataUri, aboutPhoto: null } });
  assert.equal(r.status, 200);
  const url = r.json.data.value.homePhoto;
  assert.match(url, /^\/uploads\/images\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
  const again = await api('PUT', '/api/admin/content/images', { value: { homePhoto: dataUri, aboutPhoto: null } });
  assert.equal(again.json.data.value.homePhoto, url, 'same bytes must reuse the same file');
  const file = await fetch(base + url);
  assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
  const part = await fetch(base + url, { headers: { range: 'bytes=0-7' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 8);
  const evil = await api('PUT', '/api/admin/content/images', { value: { homePhoto: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') } });
  assert.equal(evil.status, 422, 'bytes that are not an image are refused even with an image MIME label');
});

test('collections: create / read / update / reorder / delete + public view', async () => {
  const c1 = await api('POST', '/api/admin/projects', { title: 'Shop', category: 'web', desc: 'A store', featured: true, image: dataUri });
  assert.equal(c1.status, 201); assert.match(c1.json.data.id, /^p_/);
  assert.match(c1.json.data.image, /^\/uploads\//);
  const c2 = await api('POST', '/api/admin/projects', { title: 'Blog', category: 'web' });
  assert.equal(c2.status, 201);
  assert.equal((await api('POST', '/api/admin/projects', { category: 'web' })).status, 422, 'title required');
  assert.equal((await api('POST', '/api/admin/skills', { name: 'Rust', value: 140 })).status, 422);

  const pubList = await api('GET', '/api/projects', undefined, { noCookie: true });
  assert.deepEqual(pubList.json.data.map((p) => p.title), ['Shop', 'Blog']);
  assert.equal((await api('GET', '/api/projects?featured=1', undefined, { noCookie: true })).json.data.length, 1);

  const upd = await api('PUT', `/api/admin/projects/${c1.json.data.id}`, { title: 'Shop v2' });
  assert.equal(upd.json.data.title, 'Shop v2'); assert.equal(upd.json.data.featured, true, 'partial update keeps other fields');
  const re = await api('PUT', '/api/admin/projects/reorder', { ids: [c1.json.data.id, c2.json.data.id] });
  assert.equal(re.status, 200);
  assert.equal((await api('GET', '/api/projects/' + c1.json.data.id, undefined, { noCookie: true })).json.data.order, 1);
  assert.equal((await api('PUT', '/api/admin/projects/reorder', { ids: [c1.json.data.id] })).status, 409);
  assert.equal((await api('DELETE', '/api/admin/projects/' + c2.json.data.id)).status, 200);
  assert.equal((await api('DELETE', '/api/admin/projects/' + c2.json.data.id)).status, 404);
  assert.equal((await api('GET', '/api/projects/' + c2.json.data.id, undefined, { noCookie: true })).status, 404);
});

test('contact form: validation, sanitising, honeypot, storage, admin inbox', async () => {
  const anon = { noCookie: true };
  assert.equal((await api('POST', '/api/messages', { name: 'A', email: 'bad', message: 'x' }, anon)).status, 422);
  const v = await api('POST', '/api/messages', { name: 'A', email: 'bad', message: 'x' }, anon);
  assert.deepEqual(v.json.errors.map((e) => e.field).sort(), ['email', 'message', 'name']);

  const ok = await api('POST', '/api/messages', { name: '<b>Jane</b> Doe', email: 'Jane@Example.com', phone: '+1 555 0100', projectType: 'Website', budget: '$1k', message: 'Hello <script>alert(1)</script> I need a site.' }, anon);
  assert.equal(ok.status, 201); assert.match(ok.json.data.id, /^[0-9a-f-]{36}$/);
  const hp = await api('POST', '/api/messages', { name: 'Bot', email: 'bot@example.com', message: 'buy now please', website: 'http://spam' }, anon);
  assert.equal(hp.status, 201);

  const list = await api('GET', '/api/admin/messages');
  assert.equal(list.json.meta.total, 1, 'honeypot message is not stored');
  const m = list.json.data[0];
  assert.equal(m.name, 'Jane Doe'); assert.equal(m.email, 'jane@example.com'); assert.equal(m.status, 'unread');
  assert.equal(m.message.includes('<script>'), false);
  assert.equal(list.json.meta.unread, 1);

  assert.equal((await api('GET', '/api/admin/messages?q=jane')).json.meta.total, 1);
  assert.equal((await api('GET', '/api/admin/messages?q=nobody')).json.meta.total, 0);
  assert.equal((await api('GET', '/api/admin/messages?q=%25')).json.meta.total, 0, 'LIKE wildcards are escaped');
  assert.equal((await api('GET', '/api/admin/messages?status=read')).json.meta.total, 0);
  assert.equal((await api('PATCH', '/api/admin/messages/' + m.id, { status: 'read' })).json.data.read, true);
  assert.equal((await api('GET', '/api/admin/messages?status=read')).json.meta.total, 1);
  assert.equal((await api('PATCH', '/api/admin/messages/' + m.id, { status: 'bogus' })).status, 422);
  assert.equal((await api('GET', '/api/admin/messages/' + m.id)).json.data.phone, '+1 555 0100');
  assert.equal((await api('GET', '/api/admin/messages/not-a-uuid')).status, 404);
  assert.equal((await api('DELETE', '/api/admin/messages')).status, 400, 'bulk delete needs confirm');
  assert.equal((await api('DELETE', '/api/admin/messages/' + m.id)).status, 200);
  assert.equal((await api('GET', '/api/admin/messages')).json.meta.total, 0);
});

test('reviews: pending until approved; admin sync never drops newer reviews', async () => {
  const anon = { noCookie: true };
  assert.equal((await api('POST', '/api/reviews', { name: 'Sam', rating: 9, message: 'great' }, anon)).status, 422);
  const r = await api('POST', '/api/reviews', { name: 'Sam', rating: 5, message: 'Great developer!' }, anon);
  assert.equal(r.status, 201);
  assert.equal((await api('GET', '/api/testimonials', undefined, anon)).json.data.length, 0);
  const pubContent = (await api('GET', '/api/content', undefined, anon)).json.data.items.find((i) => i.key === 'reviews').value;
  assert.equal(pubContent.length, 0, 'unapproved reviews are not public');
  const adminContent = (await api('GET', '/api/admin/content')).json.data.items.find((i) => i.key === 'reviews').value;
  assert.equal(adminContent.length, 1);
  const id = r.json.data.id;
  assert.equal((await api('PATCH', '/api/admin/reviews/' + id, { approved: true })).status, 200);
  assert.equal((await api('GET', '/api/testimonials', undefined, anon)).json.data[0].name, 'Sam');

  // a stale admin save (loaded before a newer review arrived) must not delete the newer one
  const knownBefore = Date.now();
  await new Promise((s) => setTimeout(s, 5));
  const late = await api('POST', '/api/reviews', { name: 'Late', rating: 4, message: 'Arrived later' }, anon);
  const sync = await api('PUT', '/api/admin/content/reviews', { value: [{ id, name: 'Sam', rating: 5, message: 'Great developer!', approved: true }], knownBefore });
  assert.equal(sync.status, 200);
  const ids = (await api('GET', '/api/admin/reviews')).json.data.map((x) => x.id);
  assert.ok(ids.includes(late.json.data.id)); assert.ok(ids.includes(id));
  assert.equal((await api('DELETE', '/api/admin/reviews/' + late.json.data.id)).status, 200);
});

test('media: upload validation, in-use protection, delete', async () => {
  const form = (buf, name, type) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); return f; };
  const up = await api('POST', '/api/admin/media', form(PNG, 'logo.png', 'image/png'));
  assert.equal(up.status, 201); assert.equal(up.json.data.kind, 'image'); assert.match(up.json.data.url, /^\/uploads\/images\//);
  assert.equal(up.json.data.filename.includes('logo'), false, 'stored under a generated name');

  const fake = await api('POST', '/api/admin/media', form(Buffer.from('<?php system($_GET[1]); ?> padding padding'), 'shell.png', 'image/png'));
  assert.equal(fake.status, 422);
  const svg = await api('POST', '/api/admin/media', form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml'));
  assert.equal(svg.status, 422, 'SVG is refused');
  const tooBig = Buffer.concat([PNG, Buffer.alloc(config.MAX_IMAGE_MB * 1024 * 1024 + 10)]);
  assert.equal((await api('POST', '/api/admin/media', form(tooBig, 'big.png', 'image/png'))).status, 413);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64)]);
  const vid = await api('POST', '/api/admin/media', form(mp4, 'clip.mp4', 'video/mp4'));
  assert.equal(vid.status, 201); assert.equal(vid.json.data.kind, 'video');
  assert.equal((await api('POST', '/api/admin/media', new FormData())).status, 422);

  const list = await api('GET', '/api/admin/media?kind=video');
  assert.equal(list.json.data.length, 1);

  await api('PUT', '/api/admin/content/images', { value: { homePhoto: up.json.data.url, aboutPhoto: null } });
  const blocked = await api('DELETE', '/api/admin/media/' + up.json.data.id);
  assert.equal(blocked.status, 400); assert.equal(blocked.json.error, 'MEDIA_IN_USE');
  assert.equal((await api('DELETE', '/api/admin/media/' + up.json.data.id + '?force=1')).status, 200);
  assert.equal((await fetch(base + up.json.data.url)).status, 404, 'file removed from disk');
  assert.equal((await api('DELETE', '/api/admin/media/' + vid.json.data.id)).status, 200);
});

test('static: uploads are safe, traversal blocked, frontend served', async () => {
  const trav = await fetch(base + '/uploads/..%2f..%2fdatabase%2ftest.sqlite');
  assert.notEqual(trav.status, 200);
  assert.equal((await fetch(base + '/%2e%2e/backend/package.json')).status, 404);
  assert.equal((await fetch(base + '/legacy-supabase/supabase-client.js')).status, 404);
  const home = await fetch(base + '/'); assert.equal(home.status, 200);
  assert.match(await home.text(), /<html/i);
  assert.equal((await fetch(base + '/js/cms.js')).status, 200);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('analytics: events, heartbeat, admin summary, clear', async () => {
  const anon = { noCookie: true };
  assert.equal((await api('POST', '/api/analytics/event', { sid: 'x' }, anon)).status, 400);
  const ev = { sid: 'sess_abc12345', page: 'home', ref: 'Direct', device: 'Desktop', browser: 'Chrome', newSession: true };
  assert.equal((await api('POST', '/api/analytics/event', ev, anon)).status, 202);
  await api('POST', '/api/analytics/event', { ...ev, page: 'portfolio', newSession: false, ref: 'Internal' }, anon);
  await api('POST', '/api/analytics/event', { sid: 'sess_zzz98765', page: 'contact', evt: 'lead', label: 'form' }, anon);
  assert.equal((await api('POST', '/api/analytics/heartbeat', { sid: ev.sid, page: 'home', device: 'Desktop' }, anon)).status, 202);
  const s = (await api('GET', '/api/admin/analytics?days=7&tz=300')).json.data;
  assert.equal(s.totalViews, 2); assert.equal(s.totalSessions, 1); assert.equal(s.totalLeads, 1);
  assert.equal(s.liveCount, 1); assert.equal(s.series.length, 7);
  assert.equal(s.series.reduce((a, b) => a + b.count, 0), 2);
  assert.equal(s.byPage.find((p) => p.key === 'home').count, 1);
  assert.equal((await api('GET', '/api/admin/analytics', undefined, anon)).status, 401);
  assert.equal((await api('DELETE', '/api/admin/analytics')).status, 200);
  assert.equal((await api('GET', '/api/admin/analytics?days=7')).json.data.totalViews, 0);
});

test('dashboard figures and activity log reflect real data', async () => {
  const d = (await api('GET', '/api/admin/dashboard')).json.data;
  assert.equal(d.counts.projects.total, 1); assert.equal(d.counts.projects.published, 1); assert.equal(d.counts.projects.draft, 0);
  assert.equal(d.counts.services.total, 1); assert.equal(d.counts.messages.total, 0);
  assert.equal(d.counts.testimonials.total, 1);
  assert.equal(d.recentProjects[0].title, 'Shop v2'); assert.ok(d.recentProjects[0].updatedAt);
  const act = (await api('GET', '/api/admin/activity?limit=100')).json;
  const actions = act.data.map((a) => a.action);
  for (const a of ['auth.login', 'auth.login_failed', 'auth.logout', 'content.updated', 'project.created', 'project.deleted', 'message.deleted', 'media.uploaded', 'media.deleted']) {
    assert.ok(actions.includes(a), 'missing activity: ' + a);
  }
  assert.ok(act.data.every((a) => a.admin !== undefined && a.at));
  assert.equal((await api('GET', '/api/admin/activity?action=project.')).json.data.every((a) => a.action.startsWith('project.')), true);
});

test('rate limiting: contact form and sign-in', async () => {
  rl.reset(); config.RATE_LIMIT_ENABLED = true;
  try {
    const anon = { noCookie: true }; let last;
    for (let i = 0; i < 6; i++) last = await api('POST', '/api/messages', { name: 'Rate Test', email: 'r@example.com', message: 'hello there ' + i }, anon);
    assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
    rl.reset(); let l2;
    for (let i = 0; i < 11; i++) l2 = await api('POST', '/api/auth/login', { identifier: 'ghost', password: 'nope-nope-1' }, anon);
    assert.equal(l2.status, 429);
  } finally { config.RATE_LIMIT_ENABLED = false; rl.reset(); }
});

test('changing the password invalidates other sessions and old password', async () => {
  const other = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 't' }, body: JSON.stringify({ identifier: 'owner', password: 'Test-pass-12345' }) });
  const otherCookie = other.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('POST', '/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'New-password-123' })).status, 422);
  assert.equal((await api('POST', '/api/auth/change-password', { currentPassword: 'Test-pass-12345', newPassword: 'short' })).status, 422);
  assert.equal((await api('POST', '/api/auth/change-password', { currentPassword: 'Test-pass-12345', newPassword: 'New-password-123' })).status, 200);
  assert.equal((await api('GET', '/api/auth/me')).status, 200, 'current browser stays signed in');
  assert.equal((await api('GET', '/api/auth/me', undefined, { noCookie: true, headers: { cookie: otherCookie } })).status, 401, 'other session ended');
  assert.equal((await login('owner', 'Test-pass-12345')).status, 401);
  assert.equal((await login('owner', 'New-password-123')).status, 200);
});

test('data persists across a server restart', async () => {
  const before = (await api('GET', '/api/content', undefined, { noCookie: true })).json.data.items.find((i) => i.key === 'services').value;
  server.closeAllConnections(); await new Promise((r) => server.close(r)); db.close();
  server = await start(); base = 'http://127.0.0.1:' + server.address().port;
  const after = (await api('GET', '/api/content', undefined, { noCookie: true })).json.data.items.find((i) => i.key === 'services').value;
  assert.deepEqual(after, before);
  assert.equal((await login('owner', 'New-password-123')).status, 200);
});
