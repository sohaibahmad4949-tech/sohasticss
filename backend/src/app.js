'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { createApp } = require('./utils/router');
const { context } = require('./middleware/context');
const { securityHeaders, cors } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');
const { serveDir } = require('./middleware/staticFiles');
const registerRoutes = require('./routes');

function buildApp() {
  const app = createApp();
  app.use(context);
  app.use(securityHeaders);
  app.use(cors);
  app.use(async (req, res, next) => {          // access log
    res.on('finish', () => {
      if (req.path && req.path.startsWith('/api/')) {
        const ms = Number(process.hrtime.bigint() - req.startedAt) / 1e6;
        logger.debug('request', { id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: +ms.toFixed(1) });
      }
    });
    return next();
  });

  registerRoutes(app);

  // Admin panel: kept in backend/admin, completely separate from the public site.
  const adminDir = path.join(config.ROOT, 'admin');
  app.get('/admin.html', (req, res) => { res.statusCode = 301; res.setHeader('Location', '/admin/'); res.end(); });
  app.use(async (req, res, next) => {
    if (req.path === '/admin' || req.path.startsWith('/admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'no-cache');
    }
    return next();
  });
  app.use(serveDir(adminDir, { prefix: '/admin', cache: 'no-cache' }));

  // Uploaded media (long cache; filenames are unique so they never change)
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
  app.use(serveDir(config.UPLOAD_DIR, { prefix: '/uploads', immutable: true }));

  // The website itself (optional: you can host the frontend elsewhere)
  if (config.SERVE_FRONTEND && fs.existsSync(config.FRONTEND_DIR)) {
    app.use(serveDir(config.FRONTEND_DIR, { hide: /^(legacy-supabase|README\.md|SUPABASE_SETUP\.md)/ }));
    // Browsers always ask for /favicon.ico; answer quietly when the site has none.
    app.get('/favicon.ico', (req, res) => { res.statusCode = 204; res.setHeader('Cache-Control', 'public, max-age=86400'); res.end(); });
    const notFoundPage = path.join(config.FRONTEND_DIR, '404.html');
    app.onNotFound((req, res) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) throw require('./utils/errors').notFound('Route not found');
      res.statusCode = 404;
      if (fs.existsSync(notFoundPage)) return res.sendBuffer(fs.readFileSync(notFoundPage), 'text/html; charset=utf-8');
      res.sendBuffer(Buffer.from('<!doctype html><meta charset="utf-8"><title>Not found</title><h1>404 — page not found</h1><p><a href="/">Back to home</a></p>'), 'text/html; charset=utf-8');
    });
  }
  app.onError(errorHandler);
  return app;
}
module.exports = { buildApp };
