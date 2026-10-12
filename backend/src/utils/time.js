/**
 * Timestamps are written as JS Dates. SQLite hands them back as epoch
 * milliseconds and PostgreSQL as Date objects, so everything read from the
 * database goes through these helpers to get one consistent shape.
 */
const now = () => new Date();

function toDate(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return new Date(Number(v));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const toIso = (v) => { const d = toDate(v); return d ? d.toISOString() : null; };
const toMs = (v) => { const d = toDate(v); return d ? d.getTime() : null; };
const dayKey = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10); // YYYY-MM-DD in UTC
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

module.exports = { now, toDate, toIso, toMs, dayKey, daysAgo };
