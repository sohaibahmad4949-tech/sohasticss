'use strict';
const db = require('./db');
const q = (sql) => db.get().prepare(sql);

module.exports = {
  addEvent(e) {
    q('INSERT INTO analytics_events (ts, page, sid, ref, device, browser, evt, label, new_session) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.ts, e.page || null, e.sid, e.ref || null, e.device || null, e.browser || null, e.evt || null, e.label || null, e.newSession ? 1 : 0);
  },
  beat(sid, page, device) {
    q(`INSERT INTO analytics_heartbeats (sid, last, page, device) VALUES (?, ?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET last = excluded.last, page = excluded.page, device = excluded.device`).run(sid, Date.now(), page || null, device || null);
  },
  live: (sinceMs) => q('SELECT sid, page, device, last FROM analytics_heartbeats WHERE last >= ? ORDER BY last DESC').all(sinceMs).map((r) => ({ ...r })),
  liveCount: (sinceMs) => q('SELECT COUNT(*) c FROM analytics_heartbeats WHERE last >= ?').get(sinceMs).c,
  /* Page-view aggregates since `from` (ms). tzMin = client UTC offset in minutes (e.g. 300 for UTC+5). */
  summary(from, tzMin) {
    const views = q('SELECT COUNT(*) c FROM analytics_events WHERE evt IS NULL AND ts >= ?').get(from).c;
    const leads = q("SELECT COUNT(*) c FROM analytics_events WHERE evt = 'lead' AND ts >= ?").get(from).c;
    const sess = q(`SELECT COUNT(*) sessions, COALESCE(SUM(n <= 1), 0) bounced FROM
                    (SELECT sid, COUNT(*) n FROM analytics_events WHERE evt IS NULL AND ts >= ? GROUP BY sid)`).get(from);
    const tally = (col, extra) => q(`SELECT COALESCE(${col}, 'Unknown') k, COUNT(*) c FROM analytics_events
                    WHERE evt IS NULL AND ts >= ? ${extra || ''} GROUP BY k ORDER BY c DESC LIMIT 25`).all(from).map((r) => ({ key: r.k, count: r.c }));
    const perDay = q(`SELECT date((ts + ?) / 1000, 'unixepoch') d, COUNT(*) c FROM analytics_events
                      WHERE evt IS NULL AND ts >= ? GROUP BY d`).all(tzMin * 60000, from);
    const recent = q(`SELECT ts, page, ref, evt FROM analytics_events WHERE ts >= ? AND (evt IS NULL OR evt = 'lead') ORDER BY ts DESC LIMIT 40`).all(from).map((r) => ({ ...r }));
    return {
      views, leads, sessions: sess.sessions, bounced: sess.bounced,
      byPage: tally('page'), byRef: tally('ref', 'AND new_session = 1'), byDevice: tally('device'), byBrowser: tally('browser'),
      perDay: perDay.map((r) => ({ ...r })), recent
    };
  },
  viewsSince: (from) => q('SELECT COUNT(*) c FROM analytics_events WHERE evt IS NULL AND ts >= ?').get(from).c,
  clear() { q('DELETE FROM analytics_events').run(); q('DELETE FROM analytics_heartbeats').run(); },
  prune(eventsBefore, beatsBefore) {
    q('DELETE FROM analytics_events WHERE ts < ?').run(eventsBefore);
    q('DELETE FROM analytics_heartbeats WHERE last < ?').run(beatsBefore);
  }
};
