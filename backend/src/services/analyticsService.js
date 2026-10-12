'use strict';
const analytics = require('../models/analytics');
const LIVE_WINDOW_MS = 60 * 1000;

function summary(rangeDays, tzMin) {
  const days = rangeDays > 0 ? Math.min(rangeDays, 365) : 0;
  const now = Date.now();
  const from = days ? now - days * 86400000 : 0;
  const s = analytics.summary(from, tzMin);
  const live = analytics.live(now - LIVE_WINDOW_MS).map((r) => ({ sid: r.sid, page: r.page, device: r.device, last: r.last }));

  // Build a gap-free daily series in the client's timezone.
  const span = days || 30;
  const byDay = new Map(s.perDay.map((r) => [r.d, r.c]));
  const series = [];
  for (let i = span - 1; i >= 0; i--) {
    const shifted = new Date(now + tzMin * 60000 - i * 86400000);
    const d = shifted.toISOString().slice(0, 10);
    series.push({ label: d, count: byDay.get(d) || 0 });
  }
  return {
    totalViews: s.views, totalSessions: s.sessions, totalLeads: s.leads,
    bounceRate: s.sessions ? Math.round((s.bounced / s.sessions) * 100) : 0,
    avgPagesPerSession: s.sessions ? +(s.views / s.sessions).toFixed(1) : 0,
    byPage: s.byPage, byRef: s.byRef, byDevice: s.byDevice, byBrowser: s.byBrowser,
    series, live, liveCount: live.length,
    recent: s.recent.map((r) => ({ ts: r.ts, page: r.page, ref: r.ref, evt: r.evt || undefined })),
    hasAnyData: s.views > 0
  };
}
const liveCount = () => analytics.liveCount(Date.now() - LIVE_WINDOW_MS);
const live = () => analytics.live(Date.now() - LIVE_WINDOW_MS).map((r) => ({ sid: r.sid, page: r.page, device: r.device, last: r.last }));
module.exports = { summary, liveCount, live };
