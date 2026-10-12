// =====================================================================
// CmsApi — client for the Sohastics backend REST API (the admin panel's
// only way to read and change anything).
//
// Loaded after api-config.js and before cms.js / admin.js. Every call goes to
// the server and its database; nothing is saved only in the browser. The
// session is an HttpOnly cookie set by POST /api/auth/login, so no token or
// password is ever kept in JavaScript or localStorage.
//
// Exposes window.CmsApi. Methods fail soft: they resolve with { ok:false, error }
// or null, so a temporarily unreachable API never throws inside the UI.
// =====================================================================
(function () {
  'use strict';

  var BASE = (window.CMS_API_BASE || '').replace(/\/+$/, '');
  var ADMIN = window.CMS_ADMIN_MODE === true;
  var DEFAULT_TIMEOUT = 15000;
  var TZ_MIN = -new Date().getTimezoneOffset();

  function url(path) { return BASE + path; }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  // Turns the server's validation list into one readable sentence.
  function messageFrom(json, status) {
    if (json && Array.isArray(json.errors) && json.errors.length) {
      return json.errors.map(function (e) { return e.message; }).join(' ');
    }
    if (json && json.message) return json.message;
    return 'Request failed (' + status + ')';
  }

  // Core request helper. Always resolves to { ok, status, data, meta, error, code, details }.
  function request(method, path, body, opts) {
    opts = opts || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeout || DEFAULT_TIMEOUT) : null;
    var headers = { 'Accept': 'application/json' };
    // The server refuses cookie-authenticated writes without this header (CSRF defence).
    if (method !== 'GET' && method !== 'HEAD') headers['X-Requested-With'] = 'sohastics-admin';
    var init = {
      method: method,
      headers: headers,
      credentials: ADMIN || opts.credentials ? 'include' : 'omit',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    };
    if (opts.etag) headers['If-None-Match'] = opts.etag;
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(url(path), init).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res.status === 304) return { ok: true, status: 304, notModified: true, etag: opts.etag };
      // An admin request answered 401 means the session ended (or never existed).
      if (res.status === 401 && ADMIN && !/^\/api\/auth\//.test(path)) {
        try { window.dispatchEvent(new CustomEvent('cms:auth-expired')); } catch (e) {}
      }
      var etag = res.headers.get('ETag');
      return res.json().catch(function () { return {}; }).then(function (json) {
        var ok = res.ok && json.success !== false;
        return {
          ok: ok,
          status: res.status,
          data: json.data,
          meta: json.meta,
          message: json.message,
          error: ok ? undefined : messageFrom(json, res.status),
          code: json.error,
          details: json.errors,
          etag: etag
        };
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      return { ok: false, status: 0, error: err && err.name === 'AbortError' ? 'The server took too long to respond.' : 'Could not reach the server.' };
    });
  }

  // Server pagination meta -> the shape the admin lists use.
  function pagination(meta, params) {
    meta = meta || {};
    var total = meta.total || 0;
    var limit = meta.limit || (params && params.limit) || 20;
    return { page: meta.page || 1, limit: limit, total: total, totalPages: meta.pages || Math.max(1, Math.ceil(total / limit)) };
  }

  /* ---------------- Content (public + admin) ---------------- */
  var contentEtag = null;
  // Returns [{key, value}] rows, or null when nothing changed / unreachable.
  function pullContent(opts) {
    opts = opts || {};
    var path = ADMIN ? '/api/admin/content' : '/api/content';
    return request('GET', path, undefined, { etag: opts.force ? null : contentEtag, timeout: opts.timeout }).then(function (r) {
      if (r.notModified) return null;
      if (!r.ok || !r.data || !Array.isArray(r.data.items)) return null;
      if (r.etag) contentEtag = r.etag;
      return r.data.items.map(function (it) { return { key: it.key, value: it.value }; });
    });
  }

  // Admin only. Resolves { ok, value } — `value` is what the server stored
  // (e.g. uploaded data-URI images replaced with real file URLs).
  function pushContent(key, value) {
    if (!ADMIN) return Promise.resolve({ ok: false, error: 'Not an admin session.' });
    return request('PUT', '/api/admin/content/' + encodeURIComponent(key), { value: value }).then(function (r) {
      var result = { ok: r.ok, key: key, status: r.status, error: r.error, details: r.details, value: r.ok && r.data ? r.data.value : undefined };
      try { window.dispatchEvent(new CustomEvent('cms:save-result', { detail: result })); } catch (e) {}
      return result;
    });
  }

  /* ---------------- Public submissions ---------------- */
  function insertMessage(msg) {
    return request('POST', '/api/messages', {
      name: msg.name, email: msg.email, projectType: msg.projectType,
      budget: msg.budget, message: msg.message, website: msg.website || ''
    }).then(function (r) { return { ok: r.ok, error: r.error, details: r.details, id: r.data && r.data.id }; });
  }

  function submitReview(review) {
    return request('POST', '/api/reviews', {
      name: review.name, rating: review.rating, message: review.message, website: review.website || ''
    }).then(function (r) { return { ok: r.ok, error: r.error, details: r.details }; });
  }

  /* ---------------- Messages (admin) ---------------- */
  function listMessages(params) {
    params = params || {};
    return request('GET', '/api/admin/messages' + qs({
      page: params.page, limit: params.limit, q: params.search, status: params.status, projectType: params.projectType
    })).then(function (r) {
      return r.ok ? { items: r.data || [], pagination: pagination(r.meta, params) } : null;
    });
  }
  function messageStats() {
    return request('GET', '/api/admin/messages/stats' + qs({ tz: TZ_MIN })).then(function (r) { return r.ok ? r.data : null; });
  }
  function setMessageRead(id, read) {
    return request('PATCH', '/api/admin/messages/' + encodeURIComponent(id), { status: read ? 'read' : 'unread' }).then(function (r) { return r.ok; });
  }
  function markAllMessagesRead() {
    return request('POST', '/api/admin/messages/mark-all-read').then(function (r) { return r.ok; });
  }
  function deleteMessage(id) {
    return request('DELETE', '/api/admin/messages/' + encodeURIComponent(id)).then(function (r) { return r.ok; });
  }
  function deleteAllMessages() {
    return request('DELETE', '/api/admin/messages?confirm=all').then(function (r) { return r.ok; });
  }

  /* ---------------- Reviews / testimonials (admin) ---------------- */
  function listReviews() {
    return request('GET', '/api/admin/reviews').then(function (r) { return r.ok ? { items: r.data || [] } : null; });
  }
  function setReviewApproved(id, approved) {
    return request('PATCH', '/api/admin/reviews/' + encodeURIComponent(id), { approved: !!approved }).then(function (r) { return r.ok; });
  }
  function deleteReview(id) {
    return request('DELETE', '/api/admin/reviews/' + encodeURIComponent(id)).then(function (r) { return r.ok; });
  }

  /* ---------------- Media (admin) ---------------- */
  function withUsage(m) {
    if (!m) return m;
    m.usageCount = m.inUse ? 1 : 0;
    return m;
  }
  function uploadFile(file, onProgress) {
    var fd = new FormData();
    fd.append('file', file);
    if (onProgress && typeof XMLHttpRequest !== 'undefined') {
      return new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url('/api/admin/media'));
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-Requested-With', 'sohastics-admin');
        xhr.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
        xhr.onload = function () {
          var json = {};
          try { json = JSON.parse(xhr.responseText); } catch (e) {}
          var ok = xhr.status >= 200 && xhr.status < 300 && json.success !== false;
          if (xhr.status === 401) { try { window.dispatchEvent(new CustomEvent('cms:auth-expired')); } catch (e) {} }
          resolve({ ok: ok, media: json.data, error: ok ? undefined : messageFrom(json, xhr.status) });
        };
        xhr.onerror = function () { resolve({ ok: false, error: 'Could not reach the server.' }); };
        xhr.send(fd);
      });
    }
    return request('POST', '/api/admin/media', fd, { timeout: 10 * 60 * 1000 }).then(function (r) {
      return { ok: r.ok, media: r.data, error: r.error };
    });
  }
  function uploadVideo(file, onProgress) {
    return uploadFile(file, onProgress).then(function (r) {
      return r.ok ? { ok: true, url: r.media.url, media: r.media } : { ok: false, error: r.error };
    });
  }
  function listMedia(params) {
    params = params || {};
    return request('GET', '/api/admin/media' + qs({ page: params.page, limit: params.limit, kind: params.type })).then(function (r) {
      return r.ok ? { items: (r.data || []).map(withUsage), pagination: pagination(r.meta, params) } : null;
    });
  }
  function deleteMedia(id, force) {
    return request('DELETE', '/api/admin/media/' + encodeURIComponent(id) + (force ? '?force=1' : '')).then(function (r) {
      return { ok: r.ok, error: r.error, inUse: r.code === 'MEDIA_IN_USE' };
    });
  }

  /* ---------------- Analytics ---------------- */
  function beacon(path, payload) {
    var json = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(url(path), new Blob([json], { type: 'application/json' }));
        if (ok) return;
      }
    } catch (e) {}
    try {
      fetch(url(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true, credentials: 'omit' }).catch(function () {});
    } catch (e) {}
  }
  function trackEvent(ev) {
    beacon('/api/analytics/event', {
      page: ev.page || null, sid: ev.sid, ref: ev.ref || null, device: ev.device || null,
      browser: ev.browser || null, evt: ev.evt || null, label: ev.label || null, newSession: !!ev.newSession
    });
  }
  function sendHeartbeat(sid, page, device) {
    beacon('/api/analytics/heartbeat', { sid: sid, page: page, device: device });
  }
  function getRemoteAnalyticsSummary(rangeDays) {
    return request('GET', '/api/admin/analytics' + qs({ days: rangeDays || 0, tz: TZ_MIN })).then(function (r) {
      if (!r.ok || !r.data) return null;
      var s = r.data;
      // The server labels chart days "label"; the admin charts read "date".
      s.series = (s.series || []).map(function (d) { return { date: d.label, count: d.count }; });
      s.remote = true;
      return s;
    });
  }
  function getLiveVisitors() {
    return request('GET', '/api/admin/analytics/live').then(function (r) { return r.ok ? r.data : null; });
  }
  function clearRemoteAnalytics() {
    return request('DELETE', '/api/admin/analytics').then(function (r) { return r.ok; });
  }

  /* ---------------- Admin dashboard / activity / system ---------------- */
  function getDashboard() {
    return request('GET', '/api/admin/dashboard').then(function (r) { return r.ok ? r.data : null; });
  }
  function getActivity(params) {
    params = params || {};
    return request('GET', '/api/admin/activity' + qs({ page: params.page, limit: params.limit, action: params.action })).then(function (r) {
      if (!r.ok) return null;
      return {
        items: (r.data || []).map(function (a) {
          return { id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, entityLabel: a.detail, adminName: a.admin, ip: a.ip, createdAt: a.at };
        }),
        pagination: pagination(r.meta, params)
      };
    });
  }
  function getSystemInfo() {
    return request('GET', '/api/admin/system').then(function (r) { return r.ok ? r.data : null; });
  }

  /* ---------------- Auth (admin) ---------------- */
  function signIn(username, password) {
    return request('POST', '/api/auth/login', { identifier: username, password: password }, { credentials: true }).then(function (r) {
      return r.ok ? { ok: true, user: r.data && r.data.user } : { ok: false, error: r.error || 'Could not sign in.', status: r.status };
    });
  }
  function signOut() {
    return request('POST', '/api/auth/logout', {}, { credentials: true }).then(function (r) { return r.ok; });
  }
  // Resolves the signed-in admin ({id, username, email, ...}) or null.
  function getSession() {
    return request('GET', '/api/auth/me', undefined, { credentials: true }).then(function (r) {
      return r.ok && r.data ? r.data.user : null;
    });
  }
  // Changing account details needs the current password (so a hijacked session can't lock the owner out).
  function updateProfile(payload) {
    return request('PATCH', '/api/auth/profile', payload).then(function (r) { return { ok: r.ok, user: r.data && r.data.user, error: r.error, details: r.details }; });
  }
  function changePassword(currentPassword, newPassword) {
    return request('POST', '/api/auth/change-password', { currentPassword: currentPassword, newPassword: newPassword }).then(function (r) {
      return { ok: r.ok, error: r.error, details: r.details };
    });
  }

  /* ---------------- Polling (keeps lists fresh without realtime sockets) ---------------- */
  function poll(fn, intervalMs) {
    var timer = null;
    function tick() {
      if (!document.hidden) { try { fn(); } catch (e) {} }
      timer = setTimeout(tick, intervalMs);
    }
    timer = setTimeout(tick, intervalMs);
    return function stop() { clearTimeout(timer); };
  }
  var contentPoll = null;
  function subscribeContent(onChange) {
    if (contentPoll) return;
    contentPoll = poll(onChange, 30000);
  }

  window.CmsApi = {
    get enabled() { return true; },
    base: BASE,
    request: request,
    pullContent: pullContent, pushContent: pushContent, subscribeContent: subscribeContent,
    insertMessage: insertMessage, submitReview: submitReview,
    listMessages: listMessages, messageStats: messageStats, setMessageRead: setMessageRead,
    markAllMessagesRead: markAllMessagesRead, deleteMessage: deleteMessage, deleteAllMessages: deleteAllMessages,
    listReviews: listReviews, setReviewApproved: setReviewApproved, deleteReview: deleteReview,
    uploadFile: uploadFile, uploadVideo: uploadVideo, listMedia: listMedia, deleteMedia: deleteMedia,
    trackEvent: trackEvent, sendHeartbeat: sendHeartbeat, getRemoteAnalyticsSummary: getRemoteAnalyticsSummary,
    getLiveVisitors: getLiveVisitors, clearRemoteAnalytics: clearRemoteAnalytics,
    getDashboard: getDashboard, getActivity: getActivity, getSystemInfo: getSystemInfo,
    signIn: signIn, signOut: signOut, getSession: getSession, updateProfile: updateProfile, changePassword: changePassword,
    poll: poll
  };
})();
