'use strict';
const http = require('http');
const config = require('./config');
const logger = require('./utils/logger');
logger.setLevel(config.LOG_LEVEL);
const db = require('./models/db');
const { buildApp } = require('./app');
const authService = require('./services/authService');
const { seedDefaults } = require('./services/seedService');
const tokens = require('./models/tokens');
const analytics = require('./models/analytics');
const activity = require('./models/activity');

async function start() {
  db.open();
  seedDefaults();
  await authService.seedFromEnv();
  if (config.EPHEMERAL_SECRET) logger.warn('JWT_SECRET is not set — using a temporary one; sign-ins will not survive a restart. Run "npm run init" to create .env.');

  const app = buildApp();
  const server = http.createServer((req, res) => { app.handle(req, res); });
  server.requestTimeout = 5 * 60 * 1000;      // large video uploads
  server.headersTimeout = 30 * 1000;
  server.keepAliveTimeout = 65 * 1000;

  const housekeeping = () => {
    try {
      tokens.prune();
      const day = 86400000;
      analytics.prune(Date.now() - 400 * day, Date.now() - day);
      activity.prune(Date.now() - 400 * day);
    } catch (e) { logger.warn('housekeeping failed', { err: String(e) }); }
  };
  housekeeping();
  const timer = setInterval(housekeeping, 6 * 3600 * 1000); timer.unref();

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.PORT, config.HOST, resolve); });
  logger.info('server started', { url: `http://localhost:${server.address().port}`, env: config.NODE_ENV, db: config.DATABASE_FILE, frontend: config.SERVE_FRONTEND });

  const shutdown = (sig) => {
    logger.info('shutting down', { sig });
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

if (require.main === module) {
  process.on('unhandledRejection', (e) => logger.error('unhandledRejection', { err: e && e.stack ? e.stack : String(e) }));
  process.on('uncaughtException', (e) => { logger.error('uncaughtException', { err: e && e.stack ? e.stack : String(e) }); process.exit(1); });
  start().catch((e) => { logger.error('failed to start', { err: e && e.stack ? e.stack : String(e) }); process.exit(1); });
}
module.exports = { start };
