/**
 * An error whose message is safe to show to API clients.
 * Anything that is NOT an ApiError is treated as an unexpected failure and
 * reported to the client as a generic 500 (details only go to the server log).
 */
class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

ApiError.badRequest = (message = 'Invalid request', details) => new ApiError(400, message, { code: 'BAD_REQUEST', details });
ApiError.unauthorized = (message = 'Authentication required') => new ApiError(401, message, { code: 'UNAUTHORIZED' });
ApiError.forbidden = (message = 'You are not allowed to do that') => new ApiError(403, message, { code: 'FORBIDDEN' });
ApiError.notFound = (message = 'Not found') => new ApiError(404, message, { code: 'NOT_FOUND' });
ApiError.conflict = (message = 'Conflict', details) => new ApiError(409, message, { code: 'CONFLICT', details });
ApiError.locked = (message = 'Temporarily locked') => new ApiError(423, message, { code: 'LOCKED' });
ApiError.tooMany = (message = 'Too many requests, please try again later') => new ApiError(429, message, { code: 'RATE_LIMITED' });

module.exports = ApiError;
