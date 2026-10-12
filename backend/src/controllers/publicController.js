'use strict';
const crypto = require('crypto');
const config = require('../config');
const contentService = require('../services/contentService');
const messages = require('../models/messages');
const reviews = require('../models/reviews');
const analytics = require('../models/analytics');
const { validate } = require('../utils/validate');
const { cleanText } = require('../utils/sanitize');
const { resolveAdmin } = require('../middleware/auth');
const { notFound } = require('../utils/errors');
const { log } = require('../services/activityService');

exports.health = (req, res) => res.ok({
  status: 'ok', time: new Date().toISOString(),
  limits: { maxImageMB: config.MAX_IMAGE_MB, maxVideoMB: config.MAX_VIDEO_MB }
}, 'Healthy');

/* All CMS documents. Admins also receive unapproved reviews. */
exports.content = (req, res) => {
  const admin = resolveAdmin(req);
  const data = contentService.allForClient({ isAdmin: !!admin });
  const etag = `"${data.version}${admin ? 'a' : 'p'}"`;
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('ETag', etag);
  if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
  res.ok(data, 'OK');
};
exports.contentVersion = (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.ok({ version: contentService.version() }, 'OK'); };

exports.settings = (req, res) => {
  const g = (k, d) => contentService.getValue(k, d);
  res.ok({ theme: g('theme', null), content: g('content', {}), contactInfo: g('contactInfo', {}), pages: g('pages', {}), seo: g('seo', {}), images: g('images', {}) }, 'OK');
};

exports.collectionList = (name) => (req, res) => {
  const all = contentService.publicList(name, req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || all.length || 1, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const items = all.slice((page - 1) * limit, page * limit);
  res.ok(items, 'OK', { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) });
};
exports.collectionGet = (name) => (req, res) => {
  const it = contentService.publicList(name).find((x) => x.id === req.params.id);
  if (!it) throw notFound('Item not found');
  res.ok(it, 'OK');
};
exports.testimonials = (req, res) => res.ok(reviews.list({ approvedOnly: true }), 'OK');

const ipHash = (ip) => crypto.createHash('sha256').update(config.JWT_SECRET + '|' + ip).digest('hex').slice(0, 24);

exports.submitMessage = (req, res) => {
  const b = req.body || {};
  // Honeypot: real visitors never fill this hidden field. Pretend success, store nothing.
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.status(201).ok({ id: crypto.randomUUID() }, 'Message received');
  const data = validate(b, {
    name: { type: 'string', required: true, min: 2, max: 100, label: 'Name' },
    email: { type: 'email', required: true, label: 'Email' },
    phone: { type: 'phone', label: 'Phone' },
    subject: { type: 'string', max: 150, label: 'Subject' },
    projectType: { type: 'string', max: 100, label: 'Project type' },
    budget: { type: 'string', max: 100, label: 'Budget' },
    message: { type: 'string', required: true, min: 5, max: 5000, multiline: true, label: 'Message' }
  });
  const saved = messages.create({ ...data, ipHash: ipHash(req.ip) });
  res.status(201).ok({ id: saved.id, createdAt: saved.submittedAt }, 'Thanks — your message has been received');
};

exports.submitReview = (req, res) => {
  const data = validate(req.body, {
    name: { type: 'string', required: true, min: 2, max: 80, label: 'Name' },
    rating: { type: 'int', required: true, min: 1, max: 5, label: 'Rating' },
    message: { type: 'string', required: true, min: 5, max: 1000, multiline: true, label: 'Review' }
  });
  const saved = reviews.create(data);
  res.status(201).ok({ id: saved.id }, 'Thanks — your review will appear once it has been approved');
};

const SID = /^[A-Za-z0-9_-]{6,64}$/;
exports.trackEvent = (req, res) => {
  const b = req.body || {};
  if (typeof b.sid !== 'string' || !SID.test(b.sid)) return res.status(400).ok(null, 'Ignored');
  const t = (v, n) => (typeof v === 'string' && v ? cleanText(v, { maxLen: n }) : null);
  analytics.addEvent({
    ts: Date.now(), sid: b.sid, page: t(b.page, 40), ref: t(b.ref, 100), device: t(b.device, 20),
    browser: t(b.browser, 30), evt: t(b.evt, 30), label: t(b.label, 100), newSession: b.newSession === true
  });
  res.status(202).ok(null, 'Recorded');
};
exports.heartbeat = (req, res) => {
  const b = req.body || {};
  if (typeof b.sid !== 'string' || !SID.test(b.sid)) return res.status(400).ok(null, 'Ignored');
  analytics.beat(b.sid, cleanText(String(b.page || ''), { maxLen: 40 }), cleanText(String(b.device || ''), { maxLen: 20 }));
  res.status(202).ok(null, 'Recorded');
};
void log;
