const crypto = require('crypto');

const uuid = () => crypto.randomUUID();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
/** Items created by the admin UI use ids like "id_lq3x9k2ab"; new API-created ones are UUIDs. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

module.exports = { uuid, sha256, ID_PATTERN };
