'use strict';
const contentService = require('../services/contentService');
const dashboard = require('../services/dashboardService');
const analyticsService = require('../services/analyticsService');
const mediaService = require('../services/mediaService');
const { log } = require('../services/activityService');
const messages = require('../models/messages');
const reviews = require('../models/reviews');
const mediaModel = require('../models/media');
const activity = require('../models/activity');
const analytics = require('../models/analytics');
const { validate, parsePage, isUuid } = require('../utils/validate');
const { parseMultipart } = require('../utils/multipart');
const { notFound, badRequest, validation } = require('../utils/errors');

const meta = (p, total) => ({ page: p.page, limit: p.limit, total, pages: Math.max(1, Math.ceil(total / p.limit)) });

exports.dashboard = (req, res) => res.ok(dashboard.overview(), 'OK');

/* ---- content documents ---- */
exports.getContent = (req, res) => res.ok(contentService.allForClient({ isAdmin: true }), 'OK');
exports.putContent = async (req, res) => {
  const key = req.params.key;
  if (key === 'reviews') return exports.syncReviews(req, res);
  const body = req.body || {};
  if (!('value' in body)) throw validation([{ field: 'value', message: 'value is required' }]);
  const out = await contentService.save(key, body.value, req.admin);
  log(req, 'content.updated', key, key, out.summary);
  res.ok({ key, value: out.value, version: contentService.version() }, 'Saved');
};

/* ---- collections (projects, services, websites, awards, milestones, skills) ---- */
const label = { projects: 'project', websites: 'website', services: 'service', awards: 'award', milestones: 'milestone', skills: 'skill' };
exports.collection = (name) => ({
  list: (req, res) => res.ok(contentService.list(name), 'OK'),
  get: (req, res) => res.ok(contentService.find(name, req.params.id), 'OK'),
  create: async (req, res) => {
    const item = await contentService.createItem(name, req.body || {}, req.admin);
    log(req, `${label[name]}.created`, name, item.id, item.title || item.name);
    res.status(201).ok(item, `${cap(label[name])} created successfully`);
  },
  update: async (req, res) => {
    const item = await contentService.updateItem(name, req.params.id, req.body || {}, req.admin);
    log(req, `${label[name]}.updated`, name, item.id, item.title || item.name);
    res.ok(item, `${cap(label[name])} updated successfully`);
  },
  remove: async (req, res) => {
    const before = contentService.find(name, req.params.id);
    await contentService.deleteItem(name, req.params.id, req.admin);
    log(req, `${label[name]}.deleted`, name, req.params.id, before.title || before.name);
    res.ok(null, `${cap(label[name])} deleted`);
  },
  reorder: async (req, res) => {
    await contentService.reorder(name, (req.body || {}).ids, req.admin);
    log(req, `${label[name]}.reordered`, name, '', 'order changed');
    res.ok(contentService.list(name), 'Order saved');
  }
});
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ---- messages ---- */
exports.listMessages = (req, res) => {
  const p = parsePage(req.query, { defLimit: 25, maxLimit: 200 });
  const q = String(req.query.q || '').trim().slice(0, 100);
  const r = messages.list({ ...p, q, status: req.query.status, projectType: req.query.projectType });
  res.ok(r.items, 'OK', { ...meta(p, r.total), unread: messages.counts().unread });
};
exports.messagesStats = (req, res) => {
  const tz = parseInt(req.query.tz, 10);
  res.ok(messages.stats(Number.isFinite(tz) ? Math.max(-840, Math.min(840, tz)) : 0), 'OK');
};
exports.messagesVersion = (req, res) => res.ok({ version: messages.version(), ...messages.counts() }, 'OK');
exports.getMessage = (req, res) => {
  if (!isUuid(req.params.id)) throw notFound('Message not found');
  const m = messages.get(req.params.id);
  if (!m) throw notFound('Message not found');
  res.ok(m, 'OK');
};
exports.patchMessage = (req, res) => {
  if (!isUuid(req.params.id)) throw notFound('Message not found');
  const { status } = validate(req.body, { status: { type: 'string', required: true, enum: ['read', 'unread'] } });
  if (!messages.setStatus(req.params.id, status)) throw notFound('Message not found');
  res.ok(messages.get(req.params.id), `Marked as ${status}`);
};
exports.markAllRead = (req, res) => { const n = messages.markAllRead(); log(req, 'message.read_all', 'message', '', `${n} marked read`); res.ok({ updated: n }, 'All messages marked as read'); };
exports.deleteMessage = (req, res) => {
  if (!isUuid(req.params.id)) throw notFound('Message not found');
  const m = messages.get(req.params.id);
  if (!m || !messages.remove(req.params.id)) throw notFound('Message not found');
  log(req, 'message.deleted', 'message', req.params.id, `from ${m.name}`);
  res.ok(null, 'Message deleted');
};
exports.deleteAllMessages = (req, res) => {
  if (req.query.confirm !== 'all') throw badRequest('Add ?confirm=all to delete every message');
  const n = messages.removeAll(); log(req, 'message.deleted_all', 'message', '', `${n} deleted`);
  res.ok({ deleted: n }, 'All messages deleted');
};

/* ---- system status (shown on the Settings page) ---- */
exports.system = (req, res) => {
  let dbOk = true;
  try { require('../models/db').get().prepare('SELECT 1').get(); } catch (e) { dbOk = false; }
  const config = require('../config');
  res.ok({
    environment: config.NODE_ENV, node: process.versions.node, uptimeSec: Math.round(process.uptime()),
    siteUrl: config.FRONTEND_URL, database: { ok: dbOk, client: 'SQLite' }
  }, 'OK');
};

/* ---- reviews / testimonials ---- */
exports.listReviews = (req, res) => res.ok(reviews.list({ approvedOnly: false }), 'OK');
exports.patchReview = (req, res) => {
  const { approved } = validate(req.body, { approved: { type: 'boolean', required: true } });
  if (!reviews.setApproved(req.params.id, approved)) throw notFound('Review not found');
  log(req, approved ? 'review.approved' : 'review.unapproved', 'review', req.params.id, '');
  res.ok(reviews.get(req.params.id), approved ? 'Review approved' : 'Review hidden');
};
exports.deleteReview = (req, res) => {
  if (!reviews.remove(req.params.id)) throw notFound('Review not found');
  log(req, 'review.deleted', 'review', req.params.id, '');
  res.ok(null, 'Review deleted');
};
exports.syncReviews = (req, res) => {
  const b = req.body || {};
  const list = Array.isArray(b.value) ? b.value : b.items;
  if (!Array.isArray(list) || list.length > 1000) throw validation([{ field: 'value', message: 'A list of reviews is required' }]);
  const items = list.map((x, i) => {
    const d = validate({ id: x && x.id, name: x && x.name, rating: x && x.rating, message: x && x.message }, {
      id: { type: 'id', required: true }, name: { type: 'string', required: true, max: 80 },
      rating: { type: 'int', required: true, min: 1, max: 5 }, message: { type: 'string', required: true, max: 1000, multiline: true }
    });
    return { ...d, approved: !!(x && x.approved), createdAt: Date.parse(x && x.submittedAt) || undefined, _i: i };
  });
  const knownBefore = Number.isFinite(Number(b.knownBefore)) ? Number(b.knownBefore) : 0;
  const r = reviews.sync(items, knownBefore);
  log(req, 'review.synced', 'review', '', `${items.length} kept, ${r.removed} removed`);
  res.ok({ key: 'reviews', value: reviews.list({ approvedOnly: false }), version: contentService.version() }, 'Saved');
};

/* ---- media ---- */
exports.listMedia = (req, res) => {
  const p = parsePage(req.query, { defLimit: 30, maxLimit: 100 });
  const r = mediaModel.list({ ...p, kind: req.query.kind });
  res.ok(r.items.map((m) => ({ ...m, inUse: mediaService.inUse(m) })), 'OK', meta(p, r.total));
};
exports.uploadMedia = async (req, res) => {
  const { files } = await parseMultipart(req, { maxBytes: mediaService.limitBytes('video'), maxFiles: 1 });
  if (!files.length) throw validation([{ field: 'file', message: 'Choose a file to upload' }]);
  const f = files[0];
  const m = await mediaService.saveBuffer(f.data, { originalName: f.filename, createdBy: req.admin.id });
  log(req, 'media.uploaded', 'media', m.id, `${m.originalName || m.filename} (${m.kind}, ${Math.round(m.size / 1024)} KB)`);
  res.status(201).ok(m, 'File uploaded');
};
exports.deleteMedia = async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound('File not found');
  const m = await mediaService.remove(req.params.id, { force: req.query.force === '1' });
  log(req, 'media.deleted', 'media', m.id, m.originalName || m.filename);
  res.ok(null, 'File deleted');
};

/* ---- activity & analytics ---- */
exports.activity = (req, res) => {
  const p = parsePage(req.query, { defLimit: 30, maxLimit: 100 });
  const r = activity.list({ ...p, action: String(req.query.action || '').slice(0, 40) });
  res.ok(r.items, 'OK', meta(p, r.total));
};
exports.analytics = (req, res) => {
  const days = parseInt(req.query.days, 10); const tz = parseInt(req.query.tz, 10);
  res.ok(analyticsService.summary(Number.isFinite(days) ? days : 30, Number.isFinite(tz) ? Math.max(-840, Math.min(840, tz)) : 0), 'OK');
};
exports.analyticsLive = (req, res) => { const live = analyticsService.live(); res.ok({ liveCount: live.length, live }, 'OK'); };
exports.clearAnalytics = (req, res) => { analytics.clear(); log(req, 'analytics.cleared', 'analytics', '', ''); res.ok(null, 'Analytics cleared'); };
