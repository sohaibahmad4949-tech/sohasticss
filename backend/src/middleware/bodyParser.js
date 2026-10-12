'use strict';
const { badRequest, tooLarge } = require('../utils/errors');
const { readBody } = require('../utils/multipart');

/* JSON body parser with a per-route size limit (bytes). */
const json = (limit = 100 * 1024) => async function parseJson(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS', 'DELETE'].includes(req.method) && !req.headers['content-length']) { req.body = {}; return next(); }
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.startsWith('application/json') && !ct.startsWith('text/plain')) {
    if (!req.headers['content-length'] || req.headers['content-length'] === '0') { req.body = {}; return next(); }
    throw badRequest('Content-Type must be application/json', { code: 'BAD_CONTENT_TYPE' });
  }
  const buf = await readBody(req, limit).catch((e) => { throw e.status === 413 ? tooLarge('Request body too large') : e; });
  if (!buf.length) { req.body = {}; return next(); }
  try { req.body = JSON.parse(buf.toString('utf8')); } catch (e) { throw badRequest('Invalid JSON body', { code: 'BAD_JSON' }); }
  return next();
};
module.exports = { json };
