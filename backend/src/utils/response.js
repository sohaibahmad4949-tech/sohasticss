/**
 * Consistent API envelope:
 *   success: { success: true,  message, data }
 *   failure: { success: false, message, error, details? }
 */
function ok(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}

function fail(res, status, message, error, details) {
  const body = { success: false, message, error: error || message };
  if (details && details.length) body.details = details;
  return res.status(status).json(body);
}

/** Parses ?page & ?limit with sane bounds. */
function parsePaging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { ok, created, fail, parsePaging, pagination };
