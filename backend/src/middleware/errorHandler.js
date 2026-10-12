'use strict';
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const config = require('../config');

function errorHandler(err, req, res) {
  let status = 500; let body;
  if (err instanceof AppError) {
    status = err.status;
    body = { success: false, message: err.message, error: err.code || 'ERROR' };
    if (err.details) body.errors = err.details;
    if (err.headers) for (const [k, v] of Object.entries(err.headers)) res.setHeader(k, v);
  } else {
    logger.error('unhandled error', { requestId: req.id, path: req.path, method: req.method, err: err && err.stack ? err.stack : String(err) });
    body = { success: false, message: 'Something went wrong on the server', error: 'INTERNAL_ERROR', requestId: req.id };
  }
  if (res.headersSent) { try { res.end(); } catch (e) { /* ignore */ } return; }
  res.statusCode = status;
  if (!res.json) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(body)); }
  res.json(body);
  if (!config.isProd && status >= 500) logger.debug('responded with error', { status });
}
module.exports = { errorHandler };
