'use strict';
const authService = require('../services/authService');
const admins = require('../models/admins');
const { validate } = require('../utils/validate');

exports.login = async (req, res) => {
  const body = req.body || {};
  const data = validate({ identifier: body.identifier || body.email || body.username, password: body.password }, {
    identifier: { type: 'string', required: true, max: 254, label: 'Email or username' },
    password: { type: 'raw', required: true, label: 'Password' }
  });
  if (typeof body.password !== 'string' || body.password.length > 500) {
    const { validation } = require('../utils/errors');
    throw validation([{ field: 'password', message: 'Password is required' }]);
  }
  const admin = await authService.login(req, res, { identifier: data.identifier, password: body.password });
  res.ok({ user: admin }, 'Signed in');
};

exports.logout = (req, res) => { authService.logout(req, res); res.ok(null, 'Signed out'); };

exports.me = (req, res) => res.ok({ user: admins.publicAdmin(req.admin) }, 'OK');

exports.changePassword = async (req, res) => {
  const b = req.body || {};
  if (typeof b.currentPassword !== 'string' || typeof b.newPassword !== 'string') {
    const { validation } = require('../utils/errors');
    throw validation([{ field: 'newPassword', message: 'Current and new password are required' }]);
  }
  await authService.changePassword(req, res, { currentPassword: b.currentPassword, newPassword: b.newPassword });
  res.ok(null, 'Password changed');
};

exports.updateProfile = async (req, res) => {
  const b = req.body || {};
  const data = validate(b, {
    email: { type: 'email', label: 'Email' },
    username: { type: 'string', min: 3, max: 40, pattern: /^[A-Za-z0-9._-]+$/, patternMessage: 'Username may only contain letters, numbers, dot, dash and underscore' },
    displayName: { type: 'string', max: 80 }
  }, { partial: true });
  if (typeof b.currentPassword !== 'string') {
    const { validation } = require('../utils/errors');
    throw validation([{ field: 'currentPassword', message: 'Current password is required' }]);
  }
  const user = await authService.updateProfile(req, { currentPassword: b.currentPassword, ...data });
  res.ok({ user }, 'Profile updated');
};
