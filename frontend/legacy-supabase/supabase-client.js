// =====================================================================
// SupaSync — thin wrapper around the Supabase JS client.
//
// Loads after supabase-config.js (which sets window.SUPABASE_CONFIG)
// and the Supabase UMD script (which sets window.supabase). Exposes
// window.SupaSync for cms.js, main.js and admin.js to use.
//
// If no URL/key has been filled in, SupaSync.enabled stays false and
// every method becomes a harmless no-op — the site keeps working
// exactly as before, entirely on localStorage, until you connect it.
// =====================================================================
(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  const hasConfig = !!(cfg.url && cfg.anonKey && /^https?:\/\//.test(cfg.url));
  const hasLib = !!(window.supabase && typeof window.supabase.createClient === 'function');
  const enabled = hasConfig && hasLib;

  let client = null;
  if (enabled) {
    try {
      client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    } catch (e) {
      console.error('SupaSync: failed to create Supabase client', e);
    }
  } else if (hasConfig && !hasLib) {
    console.warn('SupaSync: Supabase URL/key are set but the Supabase library did not load (offline, or CDN blocked). Falling back to local storage only.');
  }

  const isEnabled = () => !!client;

  /* -------------------------------------------------------------
     CONTENT — generic key/value blobs (portfolio, services, theme,
     SEO settings, page visibility, etc.)
     ------------------------------------------------------------- */
  async function pullContent() {
    if (!isEnabled()) return [];
    const { data, error } = await client.from('site_content').select('key, value');
    if (error) { console.error('SupaSync.pullContent', error.message); return []; }
    return data || [];
  }

  function pushContent(key, value) {
    if (!isEnabled()) return Promise.resolve(false);
    return client.from('site_content')
      .upsert({ key: key, value: value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .then(({ error }) => {
        if (error) { console.error('SupaSync.pushContent', key, error.message); return false; }
        return true;
      });
  }

  let contentChannel = null;
  function subscribeContent(onChange) {
    if (!isEnabled() || contentChannel) return;
    contentChannel = client.channel('site_content_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_content' }, (payload) => {
        try { onChange(payload); } catch (e) { /* ignore listener errors */ }
      })
      .subscribe();
  }

  /* -------------------------------------------------------------
     VIDEO STORAGE — uploads to the public "site-videos" bucket
     (created by supabase/schema.sql). Returns the public URL.
     ------------------------------------------------------------- */
  async function uploadVideo(file) {
    if (!isEnabled()) return { ok: false, error: 'Supabase is not configured.' };
    const ext = ((file.name || '').split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await client.storage.from('site-videos').upload(path, file, {
      cacheControl: '31536000', upsert: false, contentType: file.type || 'video/mp4'
    });
    if (error) { console.error('SupaSync.uploadVideo', error.message); return { ok: false, error: error.message }; }
    const { data } = client.storage.from('site-videos').getPublicUrl(path);
    return { ok: true, url: data.publicUrl };
  }

  /* -------------------------------------------------------------
     MESSAGES — contact form submissions (append-only from visitors)
     ------------------------------------------------------------- */
  function insertMessage(msg) {
    if (!isEnabled()) return Promise.resolve({ ok: false });
    return client.from('messages').insert({
      name: msg.name || '',
      email: msg.email || '',
      project_type: msg.projectType || '',
      budget: msg.budget || '',
      message: msg.message || ''
    }).select().single().then(({ data, error }) => {
      if (error) { console.error('SupaSync.insertMessage', error.message); return { ok: false, error: error.message }; }
      return { ok: true, row: data };
    });
  }

  async function listMessages() {
    if (!isEnabled()) return null; // null = "couldn't reach remote", caller should fall back to local
    const { data, error } = await client.from('messages').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) { console.error('SupaSync.listMessages', error.message); return null; }
    return (data || []).map(rowToMessage);
  }

  function rowToMessage(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      projectType: row.project_type,
      budget: row.budget,
      message: row.message,
      submittedAt: row.created_at,
      read: !!row.read,
      _remote: true
    };
  }

  function setMessageRead(id, read) {
    if (!isEnabled()) return Promise.resolve(false);
    return client.from('messages').update({ read: !!read }).eq('id', id).then(({ error }) => !error);
  }

  function markAllMessagesRead() {
    if (!isEnabled()) return Promise.resolve(false);
    return client.from('messages').update({ read: true }).eq('read', false).then(({ error }) => !error);
  }

  function deleteMessage(id) {
    if (!isEnabled()) return Promise.resolve(false);
    return client.from('messages').delete().eq('id', id).then(({ error }) => !error);
  }

  function deleteAllMessages() {
    if (!isEnabled()) return Promise.resolve(false);
    // Supabase requires a filter on delete; this matches every real row's id.
    return client.from('messages').delete().neq('id', '00000000-0000-0000-0000-000000000000').then(({ error }) => !error);
  }

  let messagesChannel = null;
  function subscribeMessages(onChange) {
    if (!isEnabled() || messagesChannel) return;
    messagesChannel = client.channel('messages_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        try { onChange(payload); } catch (e) {}
      })
      .subscribe();
  }

  /* -------------------------------------------------------------
     ANALYTICS — events (append-only) + heartbeats (upserted)
     ------------------------------------------------------------- */
  function trackEvent(ev) {
    if (!isEnabled()) return;
    client.from('analytics_events').insert({
      page: ev.page || null,
      sid: ev.sid,
      ref: ev.ref || null,
      device: ev.device || null,
      browser: ev.browser || null,
      evt: ev.evt || null,
      label: ev.label || null,
      new_session: !!ev.newSession
    }).then(({ error }) => { if (error) console.error('SupaSync.trackEvent', error.message); });
  }

  function sendHeartbeat(sid, page, device) {
    if (!isEnabled()) return;
    client.from('analytics_heartbeats')
      .upsert({ sid: sid, last: new Date().toISOString(), page: page, device: device }, { onConflict: 'sid' })
      .then(({ error }) => { if (error) console.error('SupaSync.sendHeartbeat', error.message); });
  }

  let heartbeatChannel = null;
  function subscribeHeartbeats(onChange) {
    if (!isEnabled() || heartbeatChannel) return;
    heartbeatChannel = client.channel('heartbeat_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analytics_heartbeats' }, (payload) => {
        try { onChange(payload); } catch (e) {}
      })
      .subscribe();
  }

  async function getLiveVisitors() {
    if (!isEnabled()) return null;
    const cutoff = new Date(Date.now() - 60 * 1000).toISOString();
    const { data, error } = await client.from('analytics_heartbeats').select('*').gte('last', cutoff);
    if (error) { console.error('SupaSync.getLiveVisitors', error.message); return null; }
    return (data || []).map(r => ({ sid: r.sid, page: r.page, device: r.device, last: new Date(r.last).getTime() }));
  }

  async function getRemoteAnalyticsSummary(rangeDays) {
    if (!isEnabled()) return null;
    const now = Date.now();
    const from = rangeDays ? new Date(now - rangeDays * 24 * 60 * 60 * 1000).toISOString() : '1970-01-01T00:00:00Z';

    const [{ data: views, error: e1 }, { data: leads, error: e2 }, live] = await Promise.all([
      client.from('analytics_events').select('ts, page, sid, ref, device, browser, new_session').is('evt', null).gte('ts', from).order('ts', { ascending: true }).limit(20000),
      client.from('analytics_events').select('ts, page, sid').eq('evt', 'lead').gte('ts', from).limit(5000),
      getLiveVisitors()
    ]);
    if (e1 || e2) { console.error('SupaSync.getRemoteAnalyticsSummary', (e1 || e2).message); return null; }

    const rows = views || [];
    const sessions = {};
    rows.forEach(e => {
      const t = new Date(e.ts).getTime();
      if (!sessions[e.sid]) sessions[e.sid] = { pages: 0, ref: e.ref };
      sessions[e.sid].pages += 1;
      if (e.new_session) sessions[e.sid].ref = e.ref;
    });
    const sessionIds = Object.keys(sessions);
    const bounced = sessionIds.filter(id => sessions[id].pages <= 1).length;

    function tally(arr, keyFn) {
      const map = {};
      arr.forEach(item => { const k = keyFn(item) || 'Unknown'; map[k] = (map[k] || 0) + 1; });
      return Object.keys(map).map(k => ({ key: k, count: map[k] })).sort((a, b) => b.count - a.count);
    }

    const days = rangeDays || 30;
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0); dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const count = rows.filter(e => { const t = new Date(e.ts).getTime(); return t >= dayStart.getTime() && t < dayEnd; }).length;
      series.push({ label: dayStart, count: count });
    }

    const liveList = live || [];
    const recent = rows.slice(-40).reverse().map(e => ({
      ts: new Date(e.ts).getTime(), page: e.page, ref: e.ref
    })).concat((leads || []).slice(-10).map(e => ({ ts: new Date(e.ts).getTime(), page: e.page, evt: 'lead' })))
      .sort((a, b) => b.ts - a.ts).slice(0, 40);

    return {
      remote: true,
      totalViews: rows.length,
      totalSessions: sessionIds.length,
      totalLeads: (leads || []).length,
      bounceRate: sessionIds.length ? Math.round((bounced / sessionIds.length) * 100) : 0,
      avgPagesPerSession: sessionIds.length ? +(rows.length / sessionIds.length).toFixed(1) : 0,
      byPage: tally(rows, e => e.page),
      byRef: tally(rows.filter(e => e.new_session), e => e.ref),
      byDevice: tally(rows, e => e.device),
      byBrowser: tally(rows, e => e.browser),
      series: series,
      live: liveList,
      liveCount: liveList.length,
      recent: recent,
      hasAnyData: rows.length > 0
    };
  }

  function clearRemoteAnalytics() {
    if (!isEnabled()) return Promise.resolve(false);
    return Promise.all([
      client.from('analytics_events').delete().neq('id', -1),
      client.from('analytics_heartbeats').delete().neq('sid', '')
    ]).then(results => results.every(r => !r.error));
  }

  /* -------------------------------------------------------------
     AUTH — one Supabase Auth user = the site admin
     ------------------------------------------------------------- */
  function signIn(email, password) {
    if (!isEnabled()) return Promise.resolve({ ok: false, error: 'Supabase is not configured.' });
    return client.auth.signInWithPassword({ email: email, password: password }).then(({ data, error }) => {
      if (error) return { ok: false, error: error.message };
      return { ok: true, session: data.session };
    });
  }
  function signOut() {
    if (!isEnabled()) return Promise.resolve();
    return client.auth.signOut();
  }
  async function getSession() {
    if (!isEnabled()) return null;
    const { data } = await client.auth.getSession();
    return data ? data.session : null;
  }
  function onAuthChange(cb) {
    if (!isEnabled()) return;
    client.auth.onAuthStateChange((event, session) => cb(event, session));
  }

  window.SupaSync = {
    get enabled() { return isEnabled(); },
    client: client,
    pullContent, pushContent, subscribeContent, uploadVideo,
    insertMessage, listMessages, setMessageRead, markAllMessagesRead, deleteMessage, deleteAllMessages, subscribeMessages,
    trackEvent, sendHeartbeat, subscribeHeartbeats, getLiveVisitors, getRemoteAnalyticsSummary, clearRemoteAnalytics,
    signIn, signOut, getSession, onAuthChange
  };
})();
