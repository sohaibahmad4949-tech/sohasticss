'use strict';
const activity = require('../models/activity');
const logger = require('../utils/logger');

/* Never lets a logging failure break the request that triggered it. */
function log(req, action, entity, entityId, detail, adminOverride) {
  try {
    const admin = adminOverride || (req && req.admin) || null;
    activity.add({
      adminId: admin ? admin.id : null,
      adminLabel: admin ? (admin.username || admin.email) : '',
      action, entity, entityId, detail, ip: req ? req.ip : ''
    });
  } catch (e) { logger.warn('activity log failed', { err: String(e) }); }
}
module.exports = { log };
