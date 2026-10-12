'use strict';
const pub = require('../controllers/publicController');
const auth = require('../controllers/authController');
const admin = require('../controllers/adminController');
const { COLLECTIONS } = require('../services/contentService');
const { json } = require('../middleware/bodyParser');
const { rateLimit } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { requireSameSite } = require('../middleware/security');
const MB = 1024 * 1024;

module.exports = function registerRoutes(app) {
  const small = json(100 * 1024);
  const big = json(16 * MB);

  const apiLimit = rateLimit({ name: 'api', windowMs: 60000, max: 600 });
  const pubApi = app.group('/api', apiLimit);

  /* ------------------------------ public API ------------------------------ */
  pubApi.get('/health', pub.health);
  pubApi.get('/content', pub.content);
  pubApi.get('/content/version', pub.contentVersion);
  pubApi.get('/settings', pub.settings);
  pubApi.get('/testimonials', pub.testimonials);
  for (const name of Object.keys(COLLECTIONS)) {
    pubApi.get('/' + name, pub.collectionList(name));
    pubApi.get('/' + name + '/:id', pub.collectionGet(name));
  }
  pubApi.post('/messages', rateLimit({ name: 'msg', windowMs: 3600000, max: 5, message: 'You have sent several messages recently. Please try again later.' }), small, pub.submitMessage);
  pubApi.post('/reviews', rateLimit({ name: 'rev', windowMs: 3600000, max: 5, message: 'You have submitted several reviews recently. Please try again later.' }), small, pub.submitReview);
  const track = rateLimit({ name: 'track', windowMs: 60000, max: 240 });
  pubApi.post('/analytics/event', track, small, pub.trackEvent);
  pubApi.post('/analytics/heartbeat', track, small, pub.heartbeat);

  /* ------------------------------ auth ------------------------------------ */
  const authApi = app.group('/api/auth', apiLimit);
  authApi.post('/login', rateLimit({ name: 'login', windowMs: 15 * 60000, max: 10, message: 'Too many sign-in attempts. Please wait a few minutes.' }), requireSameSite, small, auth.login);
  authApi.post('/logout', requireSameSite, require('../middleware/auth').optionalAuth, auth.logout);
  authApi.get('/me', requireAuth, auth.me);
  authApi.post('/change-password', requireAuth, requireSameSite, rateLimit({ name: 'pw', windowMs: 15 * 60000, max: 10 }), small, auth.changePassword);
  authApi.patch('/profile', requireAuth, requireSameSite, rateLimit({ name: 'profile', windowMs: 15 * 60000, max: 10 }), small, auth.updateProfile);

  /* ------------------------------ admin API ------------------------------- */
  const adm = app.group('/api/admin', apiLimit, requireAuth, requireSameSite);
  adm.get('/dashboard', admin.dashboard);
  adm.get('/system', admin.system);
  adm.get('/content', admin.getContent);
  adm.put('/content/:key', big, admin.putContent);

  for (const name of Object.keys(COLLECTIONS)) {
    const c = admin.collection(name);
    adm.get('/' + name, c.list);
    adm.post('/' + name, big, c.create);
    adm.put('/' + name + '/reorder', small, c.reorder);        // must come before /:id
    adm.get('/' + name + '/:id', c.get);
    adm.put('/' + name + '/:id', big, c.update);
    adm.delete('/' + name + '/:id', c.remove);
  }

  adm.get('/messages', admin.listMessages);
  adm.get('/messages/version', admin.messagesVersion);
  adm.get('/messages/stats', admin.messagesStats);          // must come before /messages/:id
  adm.post('/messages/mark-all-read', admin.markAllRead);
  adm.get('/messages/:id', admin.getMessage);
  adm.patch('/messages/:id', small, admin.patchMessage);
  adm.delete('/messages/:id', admin.deleteMessage);
  adm.delete('/messages', admin.deleteAllMessages);

  adm.get('/reviews', admin.listReviews);
  adm.put('/reviews/sync', json(512 * 1024), admin.syncReviews);
  adm.patch('/reviews/:id', small, admin.patchReview);
  adm.delete('/reviews/:id', admin.deleteReview);

  adm.get('/media', admin.listMedia);
  adm.post('/media', rateLimit({ name: 'upload', windowMs: 10 * 60000, max: 40, message: 'Too many uploads. Please wait a few minutes.' }), admin.uploadMedia);
  adm.delete('/media/:id', admin.deleteMedia);

  adm.get('/activity', admin.activity);
  adm.get('/analytics', admin.analytics);
  adm.get('/analytics/live', admin.analyticsLive);
  adm.delete('/analytics', admin.clearAnalytics);
};
