'use strict';
const content = require('./contentService');
const collections = require('../models/collections');
const messages = require('../models/messages');
const reviews = require('../models/reviews');
const mediaModel = require('../models/media');
const activity = require('../models/activity');
const analytics = require('../models/analytics');
const analyticsService = require('./analyticsService');

/* Every figure is read from the database — nothing is estimated. */
function overview() {
  const day = 86400000; const now = Date.now();
  const msg = messages.counts(); const rev = reviews.counts(); const med = mediaModel.stats();
  const pages = content.getValue('pages', {});
  const theme = content.getValue('theme', 'charcoal-orange');
  return {
    counts: {
      projects: { ...collections.counts('portfolio'), featured: collections.featuredCount('portfolio') },
      websites: collections.counts('websites'),
      services: collections.counts('services'),
      awards: collections.counts('awards'),
      skills: collections.counts('skills'),
      messages: { total: msg.total, unread: msg.unread },
      testimonials: { total: rev.total, pending: rev.pending },
      media: { files: med.count, bytes: med.bytes }
    },
    analytics: { views7d: analytics.viewsSince(now - 7 * day), views30d: analytics.viewsSince(now - 30 * day), live: analyticsService.liveCount() },
    disabledPages: Object.values(pages).filter((v) => v === false).length,
    theme,
    recentProjects: collections.recent('portfolio', 5).map((p) => ({ id: p.id, title: p.title, category: p.category, image: p.image, featured: !!p.featured, published: p.published, updatedAt: p.updatedAt })),
    recentMessages: messages.recent(5).map((m) => ({ id: m.id, name: m.name, email: m.email, subject: m.subject || m.projectType, message: m.message, read: m.read, createdAt: m.submittedAt })),
    recentActivity: activity.list({ limit: 10, offset: 0 }).items.map(activityForAdmin)
  };
}

function activityForAdmin(a) {
  return { id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, entityLabel: a.detail, adminName: a.admin, ip: a.ip, createdAt: a.at };
}
module.exports = { overview, activityForAdmin };
