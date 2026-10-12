'use strict';
class AppError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = opts.code || null;      // short machine-readable reason
    this.details = opts.details || null; // e.g. [{ field, message }]
    this.headers = opts.headers || null;
  }
}
const badRequest = (m, o) => new AppError(400, m, o);
const unauthorized = (m = 'Authentication required', o) => new AppError(401, m, { code: 'UNAUTHORIZED', ...o });
const forbidden = (m = 'Forbidden', o) => new AppError(403, m, { code: 'FORBIDDEN', ...o });
const notFound = (m = 'Not found', o) => new AppError(404, m, { code: 'NOT_FOUND', ...o });
const conflict = (m, o) => new AppError(409, m, { code: 'CONFLICT', ...o });
const tooLarge = (m = 'Payload too large', o) => new AppError(413, m, { code: 'PAYLOAD_TOO_LARGE', ...o });
const validation = (details, m = 'Validation failed') => new AppError(422, m, { code: 'VALIDATION_ERROR', details });
module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, tooLarge, validation };
