// =====================================================================
// SOHASTICS — ADMIN PANEL LOGIC
// Requires api-client.js and cms.js to be loaded first (window.CmsApi, window.AhmedCMS).
// Every change made here is saved to the backend database through the API.
// =====================================================================

(function () {
  'use strict';

  const CMS = window.AhmedCMS;
  const API = window.CmsApi;
  // Declared up here (not near initDashboard below) because the auto
  // sign-in at the bottom of the file can reach initDashboard() before
  // execution would otherwise get to it.
  let dashboardInitialized = false;
  let currentUser = null;

  /* ---------------- Small helpers ---------------- */
  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  function genId() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function resizeImageToDataURL(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  const ICON_EDIT = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5 13.5 4.5 5 13H3v-2L11.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const ICON_TRASH = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1L11.5 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------- Toast + save indicator ---------------- */
  const toastEl = document.getElementById('adminToast');
  const toastTextEl = document.getElementById('adminToastText');
  let toastTimer = null;
  function toast(msg) {
    toastTextEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
  }
  const saveDot = document.getElementById('saveDot');
  const saveStatusText = document.getElementById('saveStatusText');
  let dotTimer = null;
  function pulseSaveDot() {
    saveDot.classList.add('is-saved');
    saveStatusText.textContent = 'Saved just now — live on site';
    clearTimeout(dotTimer);
    dotTimer = setTimeout(() => {
      saveDot.classList.remove('is-saved');
      saveStatusText.textContent = 'Ready';
    }, 3000);
  }

  /* =================================================================
     AUTH — sign-in is handled by the backend (POST /api/auth/login).
     The session lives in an HttpOnly cookie, so no password or token is
     ever stored in the browser.
     ================================================================= */
  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const submitLabel = document.getElementById('loginSubmitLabel');
  const sectionHooks = (window.__adminHooks = {}); // section name -> refresh function

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('is-visible');
  }

  async function showDashboard(user) {
    currentUser = user;
    loginScreen.hidden = true;
    dashboard.hidden = false;
    saveStatusText.textContent = 'Loading…';
    // Everything edited here is loaded from the database first; the panel
    // refuses to open on a stale local copy that could overwrite real data.
    const loaded = await CMS.reloadFromBackend();
    if (!loaded) {
      dashboard.hidden = true;
      loginScreen.hidden = false;
      showLoginError('Signed in, but the site content could not be loaded from the server. Please try again.');
      return;
    }
    saveStatusText.textContent = 'Ready';
    initDashboard();
  }

  function reloadToLogin(hash) {
    CMS.clearCache();
    if (hash) window.location.hash = hash;
    else if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    window.location.reload();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    const btn = loginForm.querySelector('.login-submit');
    submitLabel.textContent = 'Signing in…';
    btn.disabled = true;
    const result = await API.signIn(u, p);
    btn.disabled = false;
    submitLabel.textContent = 'Log In';
    if (result.ok) {
      loginError.classList.remove('is-visible');
      document.getElementById('loginPassword').value = '';
      showDashboard(result.user);
    } else {
      showLoginError(result.error || 'Could not sign in. Check your details and try again.');
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await API.signOut();
    reloadToLogin();
  });

  // Any admin request answered with 401 means the session ended.
  window.addEventListener('cms:auth-expired', () => reloadToLogin('expired'));

  // Saves are sent to the database; if one is rejected, say so loudly and
  // resync from the server so the screen never shows data that isn't saved.
  window.addEventListener('cms:save-result', (e) => {
    const r = e.detail || {};
    if (r.ok) return;
    if (r.status === 401) return;
    const detail = r.details && r.details.length ? r.details.map((d) => d.message || d).join(' ') : (r.error || 'Unknown error');
    saveStatusText.textContent = 'Save failed — not stored';
    toast('Not saved: ' + detail);
    setTimeout(() => window.location.reload(), 3500);
  });

  /* =================================================================
     DASHBOARD INIT (runs once per login)
     ================================================================= */
  function initDashboard() {
    if (dashboardInitialized) { renderOverview(); return; }
    dashboardInitialized = true;

    initNav();
    renderOverview();
    initHomeForm();
    initPortfolioManager();
    initWebsitesManager();
    initServicesManager();
    initAwardsManager();
    initAboutSection();
    initContactSection();
    initMessagesManager();
    initReviewsManager();
    initImagesSection();
    initMediaSection();
    initActivitySection();
    initProfileSection();
    initThemeSection();
    initPagesSection();
    initAnalyticsSection();
    initSeoSection();
    initSiteNameForm();
    initSettingsSection();

    // "View Live Site" links point at the real public site.
    API.getSystemInfo().then((info) => {
      if (info && info.siteUrl) document.querySelectorAll('[data-site-link]').forEach((a) => { a.href = info.siteUrl; });
    });
    // Keep sidebar badges (unread messages / pending reviews) fresh.
    API.poll(() => { if (dashboardInitialized) refreshBadges(); }, 8000);
    // Update straight away when the admin comes back to this tab.
    const badgeRefreshNow = () => { if (dashboardInitialized && !document.hidden) refreshBadges(); };
    document.addEventListener('visibilitychange', badgeRefreshNow);
    window.addEventListener('focus', badgeRefreshNow);
  }

  /* ---------------- Sidebar nav ---------------- */
  function initNav() {
    const navItems = document.querySelectorAll('.admin-nav-item[data-section]');
    const sections = document.querySelectorAll('.admin-section');
    const topbarTitle = document.getElementById('topbarTitle');
    const titles = {
      overview: 'Dashboard', home: 'Home Page', portfolio: 'Portfolio Projects', media: 'Media Library', activity: 'Activity Log', profile: 'Admin Profile',
      services: 'Services & Pricing', websites: 'Websites For Sale', awards: 'Awards & Achievements', about: 'About Page',
      contact: 'Contact Info', messages: 'Contact Messages', reviews: 'Testimonials', images: 'Photos', theme: 'Color Theme', analytics: 'Analytics', seo: 'SEO & Search Visibility', pages: 'Page Visibility', settings: 'Settings'
    };

    function goto(section) {
      sections.forEach(s => { s.hidden = (s.id !== 'section-' + section); });
      navItems.forEach(b => b.classList.toggle('is-active', b.dataset.section === section));
      topbarTitle.textContent = titles[section] || 'Dashboard';
      document.querySelector('.admin-content').scrollTop = 0;
      window.scrollTo(0, 0);
      if (section === 'overview') renderOverview();
      else if (sectionHooks[section]) sectionHooks[section]();
    }

    navItems.forEach(b => b.addEventListener('click', () => goto(b.dataset.section)));
    document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => goto(b.dataset.goto)));
    window.__adminGoto = goto;
  }

  /* ---------------- Overview ---------------- */
  const THEME_LABELS = {
    'charcoal-orange': 'Charcoal Orange',
    'midnight-blue': 'Midnight Blue',
    'slate-purple': 'Slate Purple',
    'emerald-dark': 'Emerald Dark',
    'crimson-noir': 'Crimson Noir',
    'amber-bronze': 'Amber Bronze',
    'cyber-teal': 'Cyber Teal',
    'rosewood-pink': 'Rosewood Pink',
    'arctic-frost': 'Arctic Frost'
  };
  async function refreshBadges() {
    const d = await API.getDashboard();
    if (d) applyBadges(d);
    return d;
  }
  function applyBadges(d) {
    const msgBadge = document.getElementById('navMsgBadge');
    const revBadge = document.getElementById('navReviewBadge');
    const liveBadge = document.getElementById('navLiveBadge');
    const unread = d.counts.messages.unread;
    const pending = d.counts.testimonials.pending;
    if (msgBadge) { msgBadge.textContent = unread > 99 ? '99+' : String(unread); msgBadge.hidden = unread === 0; }
    if (revBadge) { revBadge.textContent = pending > 99 ? '99+' : String(pending); revBadge.hidden = pending === 0; }
    if (liveBadge && d.analytics) { liveBadge.textContent = String(d.analytics.live); liveBadge.hidden = !d.analytics.live; }
  }

  const ACTION_LABELS = {
    'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.password_changed': 'Changed password', 'auth.profile_updated': 'Updated account details',
    'content.updated': 'Updated', 'content.created': 'Created', 'content.deleted': 'Deleted',
    'message.deleted': 'Deleted message', 'message.deleted_all': 'Deleted all messages', 'message.read': 'Marked message read',
    'testimonial.approved': 'Approved testimonial', 'testimonial.unapproved': 'Unpublished testimonial', 'testimonial.deleted': 'Deleted testimonial',
    'media.uploaded': 'Uploaded file', 'media.deleted': 'Deleted file', 'analytics.cleared': 'Cleared analytics'
  };
  function describeActivity(a) {
    const base = ACTION_LABELS[a.action] || a.action;
    const label = a.entityLabel ? ' — ' + a.entityLabel : '';
    return base + label;
  }
  function timeAgoIso(iso) {
    const d = new Date(iso);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return d.toLocaleDateString();
  }

  // Shared pager used by messages, media and activity lists.
  function renderPager(el, pagination, onPage) {
    if (!el) return;
    if (!pagination || pagination.totalPages <= 1) {
      el.innerHTML = pagination && pagination.total ? `<span class="pager-info">${pagination.total} item${pagination.total === 1 ? '' : 's'}</span>` : '';
      return;
    }
    el.innerHTML = `
      <button type="button" class="btn btn-ghost pager-btn" data-pg="prev" ${pagination.page <= 1 ? 'disabled' : ''}>← Previous</button>
      <span class="pager-info">Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} items</span>
      <button type="button" class="btn btn-ghost pager-btn" data-pg="next" ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>Next →</button>`;
    el.querySelector('[data-pg="prev"]').addEventListener('click', () => onPage(pagination.page - 1));
    el.querySelector('[data-pg="next"]').addEventListener('click', () => onPage(pagination.page + 1));
  }

  async function renderOverview() {
    const grid = document.getElementById('overviewGrid');
    const recent = document.getElementById('overviewRecent');
    const d = await refreshBadges();
    if (!d) {
      grid.innerHTML = '<p class="admin-empty">Could not load dashboard statistics from the server. Refresh the page to try again.</p>';
      return;
    }
    const c = d.counts;
    const tile = (num, label, style) => `<div class="overview-tile"><span class="overview-num"${style ? ` style="${style}"` : ''}>${num}</span><span class="overview-label">${label}</span></div>`;
    grid.innerHTML =
      tile(c.projects.total, 'Total Projects') +
      tile(c.projects.published, 'Published Projects') +
      tile(c.projects.draft, 'Draft Projects') +
      tile(c.services.total, 'Services Listed') +
      tile(c.websites.total, 'Websites For Sale') +
      tile(c.messages.total, 'Contact Messages') +
      tile(c.messages.unread, 'Unread Messages') +
      tile(c.testimonials.pending, 'Pending Testimonials') +
      tile(d.analytics.views7d, 'Page Views (7 days)') +
      tile(d.analytics.live, 'Visitors Right Now') +
      tile(d.disabledPages, 'Disabled Pages') +
      tile(esc(THEME_LABELS[d.theme] || d.theme || '—'), 'Active Theme', 'font-size:16px;');

    const projectsHtml = d.recentProjects.length ? d.recentProjects.map((p) => `
      <div class="admin-list-item">
        <div class="admin-list-thumb" style="${p.image ? `background-image:url('${esc(p.image)}');background-size:cover;background-position:center;` : ''}"></div>
        <div class="admin-list-body">
          <p class="admin-list-title">${esc(p.title)}</p>
          <p class="admin-list-meta">${p.published ? 'Published' : 'Draft'} · ${timeAgoIso(p.updatedAt)}</p>
        </div>
      </div>`).join('') : '<p class="admin-empty">No projects yet.</p>';

    const messagesHtml = d.recentMessages.length ? d.recentMessages.map((m) => `
      <div class="admin-list-item ${m.read ? '' : 'is-unread'}">
        <div class="admin-list-body">
          <p class="admin-list-title">${esc(m.name)} <span class="msg-email">${esc(m.email)}</span></p>
          <p class="admin-list-meta">${esc((m.message || '').slice(0, 70))}${(m.message || '').length > 70 ? '…' : ''} · ${timeAgoIso(m.createdAt)}</p>
        </div>
      </div>`).join('') : '<p class="admin-empty">No inquiries yet.</p>';

    const activityHtml = d.recentActivity.length ? d.recentActivity.map((a) => `
      <div class="admin-list-item">
        <div class="admin-list-body">
          <p class="admin-list-title">${esc(describeActivity(a))}</p>
          <p class="admin-list-meta">${esc(a.adminName || 'system')} · ${timeAgoIso(a.createdAt)}</p>
        </div>
      </div>`).join('') : '<p class="admin-empty">No activity recorded yet.</p>';

    recent.innerHTML = `
      <div class="admin-card"><h2 class="admin-card-title">Recent Projects</h2><div class="admin-list">${projectsHtml}</div></div>
      <div class="admin-card"><h2 class="admin-card-title">Recent Inquiries</h2><div class="admin-list">${messagesHtml}</div></div>
      <div class="admin-card"><h2 class="admin-card-title">Recent Activity</h2><div class="admin-list">${activityHtml}</div></div>`;
  }

  /* =================================================================
     GENERIC LIST MANAGER (services, awards, portfolio, milestones, skills)
     ================================================================= */
  function createListManager(cfg) {
    const listEl = document.getElementById(cfg.listElId);
    const editWrapEl = document.getElementById(cfg.editWrapId);
    const addBtnEl = document.getElementById(cfg.addBtnId);

    function load() { return CMS.get(CMS.KEYS[cfg.storeKey], CMS.DEFAULTS[cfg.storeKey]); }
    function persist(items) {
      CMS.set(CMS.KEYS[cfg.storeKey], items);
      toast(cfg.singularLabel + ' saved');
      pulseSaveDot();
      renderOverview();
    }

    function fieldHTML(field, value) {
      const val = value === undefined || value === null ? '' : value;
      if (field.type === 'textarea') {
        return `<div><label>${esc(field.label)}</label><textarea data-field="${field.key}" rows="3">${esc(val)}</textarea></div>`;
      }
      if (field.type === 'select') {
        const options = field.options.map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
        return `<div><label>${esc(field.label)}</label><select data-field="${field.key}">${options}</select></div>`;
      }
      if (field.type === 'checkbox') {
        return `<div class="admin-checkbox-row"><input type="checkbox" data-field="${field.key}" id="chk_${field.key}_${Math.random().toString(36).slice(2,6)}" ${(value === undefined || value === null ? field.defaultTrue : val) ? 'checked' : ''}><label for="chk_${field.key}">${esc(field.label)}</label></div>`;
      }
      if (field.type === 'image') {
        const bg = val ? `background-image:url('${val}');background-size:cover;background-position:center;` : '';
        return `<div><label>${esc(field.label)}</label>
          <div class="image-upload-row">
            <div class="image-preview" id="imgPrev_${field.key}" style="${bg}">${val ? '' : 'No image'}</div>
            <div class="image-upload-actions">
              <label class="file-input-label">${'<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4 7l4-4 4 4M3 13.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'}Upload<input type="file" accept="image/*" data-imagefield="${field.key}"></label>
              <button type="button" class="btn btn-ghost" data-removeimage="${field.key}" style="padding:8px 16px;font-size:12.5px;">Remove</button>
            </div>
          </div>
        </div>`;
      }
      if (field.type === 'video') {
        const vstat = !val ? 'No video yet' : 'Video linked';
        return `<div><label>${esc(field.label)}</label>
          <input type="text" data-field="${field.key}" value="${esc(val)}" placeholder="Paste a YouTube / .mp4 link, or upload a file below">
          <div class="video-upload-row">
            <label class="file-input-label"><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2v9M4 7l4-4 4 4M3 13.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Upload Video<input type="file" accept="video/mp4,video/webm,video/quicktime,video/*" data-videofield="${field.key}"></label>
            <button type="button" class="btn btn-ghost" data-removevideo="${field.key}" style="padding:8px 16px;font-size:12.5px;">Remove</button>
            <span class="video-upload-status" id="vidStat_${field.key}">${vstat}</span>
          </div>
        </div>`;
      }
      if (field.type === 'number') {
        return `<div><label>${esc(field.label)}</label><input type="number" data-field="${field.key}" value="${esc(val)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''}></div>`;
      }
      return `<div><label>${esc(field.label)}</label><input type="text" data-field="${field.key}" value="${esc(val)}"></div>`;
    }

    function renderList() {
      const items = load();
      if (!items.length) {
        listEl.innerHTML = `<p class="admin-empty">Nothing here yet — add your first one below.</p>`;
        return;
      }
      listEl.innerHTML = items.map((item, idx) => {
        const p = cfg.previewFn(item);
        const thumbInner = p.thumbStyle ? '' : (p.thumbText || p.iconSvg || '');
        return `<div class="admin-list-item">
          <div class="admin-list-thumb" style="${p.thumbStyle || ''}">${thumbInner}</div>
          <div class="admin-list-body">
            <p class="admin-list-title">${esc(p.title)}</p>
            <p class="admin-list-meta">${esc(p.meta)}</p>
          </div>
          <div class="admin-list-actions">
            <button class="admin-icon-btn" data-move="up" data-id="${item.id}" title="Move up" type="button" ${idx === 0 ? 'disabled' : ''}><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="admin-icon-btn" data-move="down" data-id="${item.id}" title="Move down" type="button" ${idx === items.length - 1 ? 'disabled' : ''}><svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="admin-icon-btn" data-edit="${item.id}" title="Edit" type="button">${ICON_EDIT}</button>
            <button class="admin-icon-btn danger" data-delete="${item.id}" title="Delete" type="button">${ICON_TRASH}</button>
          </div>
        </div>`;
      }).join('');
      listEl.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => moveItem(b.dataset.id, b.dataset.move)));
      listEl.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startEdit(b.dataset.edit)));
      listEl.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => doDelete(b.dataset.delete)));
    }

    // Display order on the site follows the order of this list.
    function moveItem(id, dir) {
      const items = load();
      const i = items.findIndex(x => x.id === id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      persist(items);
      renderList();
    }

    function startEdit(id) {
      const items = load();
      const isNew = id === 'new';
      const item = isNew ? cfg.newItemDefaults() : Object.assign({}, items.find(i => i.id === id));
      renderEditForm(item, isNew);
      editWrapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderEditForm(item, isNew) {
      const rows = cfg.schema.map(f => fieldHTML(f, item[f.key])).join('');
      editWrapEl.innerHTML = `<div class="admin-editform">
        <p class="admin-editform-title">${isNew ? 'Add New' : 'Edit'} ${esc(cfg.singularLabel)}</p>
        <div class="admin-form">${rows}</div>
        <div class="admin-form-actions" style="margin-top:16px;">
          <button type="button" class="btn btn-primary" id="saveEditBtn">Save ${esc(cfg.singularLabel)}</button>
          <button type="button" class="btn btn-ghost" id="cancelEditBtn">Cancel</button>
        </div>
      </div>`;

      editWrapEl.querySelectorAll('[data-imagefield]').forEach(input => {
        input.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const dataUrl = await resizeImageToDataURL(file, 960, 0.82);
          item[input.dataset.imagefield] = dataUrl;
          const preview = editWrapEl.querySelector('#imgPrev_' + input.dataset.imagefield);
          preview.style.backgroundImage = `url('${dataUrl}')`;
          preview.style.backgroundSize = 'cover';
          preview.style.backgroundPosition = 'center';
          preview.textContent = '';
        });
      });
      editWrapEl.querySelectorAll('[data-removeimage]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.removeimage;
          item[key] = null;
          const preview = editWrapEl.querySelector('#imgPrev_' + key);
          preview.style.backgroundImage = '';
          preview.textContent = 'No image';
        });
      });

      editWrapEl.querySelectorAll('[data-videofield]').forEach(input => {
        input.addEventListener('change', async (e) => {
          const key = input.dataset.videofield;
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          const status = editWrapEl.querySelector('#vidStat_' + key);
          const textEl = editWrapEl.querySelector(`[data-field="${key}"]`);
          const saveBtn = editWrapEl.querySelector('#saveEditBtn');
          const maxMB = 100; // matches the server's default upload limit
          if (!/^video\//.test(file.type)) { status.textContent = 'That file is not a video.'; return; }
          if (file.size > maxMB * 1024 * 1024) {
            status.textContent = `Too large (${(file.size / 1048576).toFixed(0)} MB). Max ${maxMB} MB — compress it or paste a YouTube link instead.`;
            return;
          }
          status.textContent = 'Uploading… please wait';
          saveBtn.disabled = true;
          try {
            const r = await API.uploadVideo(file, (frac) => { status.textContent = 'Uploading… ' + Math.round(frac * 100) + '%'; });
            if (!r.ok) throw new Error(r.error || 'Upload failed');
            const ref = r.url;
            item[key] = ref;
            textEl.value = ref;
            status.textContent = `Uploaded: ${file.name} (${(file.size / 1048576).toFixed(1)} MB) — click Save to keep it`;
          } catch (err) {
            status.textContent = 'Upload failed: ' + (err && err.message ? err.message : err);
          } finally {
            saveBtn.disabled = false;
          }
        });
      });
      editWrapEl.querySelectorAll('[data-removevideo]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.removevideo;
          item[key] = '';
          editWrapEl.querySelector(`[data-field="${key}"]`).value = '';
          editWrapEl.querySelector('#vidStat_' + key).textContent = 'No video yet';
        });
      });

      editWrapEl.querySelector('#saveEditBtn').addEventListener('click', () => {
        cfg.schema.forEach(f => {
          if (f.type === 'image') return;
          const el = editWrapEl.querySelector(`[data-field="${f.key}"]`);
          if (!el) return;
          if (f.type === 'checkbox') item[f.key] = el.checked;
          else if (f.type === 'number') item[f.key] = Number(el.value);
          else item[f.key] = el.value;
        });
        let items = load();
        if (isNew) items.push(item);
        else items = items.map(i => (i.id === item.id ? item : i));
        persist(items);
        editWrapEl.innerHTML = '';
        renderList();
      });
      editWrapEl.querySelector('#cancelEditBtn').addEventListener('click', () => { editWrapEl.innerHTML = ''; });
    }

    function doDelete(id) {
      if (!confirm(`Delete this ${cfg.singularLabel.toLowerCase()}? This can't be undone.`)) return;
      const items = load().filter(i => i.id !== id);
      persist(items);
      renderList();
    }

    addBtnEl && addBtnEl.addEventListener('click', () => startEdit('new'));
    renderList();
    return { renderList };
  }

  /* ---------------- Portfolio manager ---------------- */
  function initPortfolioManager() {
    createListManager({
      storeKey: 'portfolio',
      listElId: 'portfolioList',
      editWrapId: 'portfolioEditFormWrap',
      addBtnId: 'btnAddPortfolio',
      singularLabel: 'Project',
      schema: [
        { key: 'title', label: 'Project Title', type: 'text' },
        { key: 'category', label: 'Category', type: 'select', options: [
          { value: 'longform', label: 'Web Applications' },
          { value: 'reels', label: 'Landing Pages' },
          { value: 'color', label: 'E-commerce & Backend' }
        ]},
        { key: 'desc', label: 'One-line Description', type: 'textarea' },
        { key: 'tc', label: 'Tech Stack Tag (e.g. React, Node.js)', type: 'text' },
        { key: 'tone', label: 'Accent Colour', type: 'select', options: [
          { value: 'orange', label: 'Orange' }, { value: 'blue', label: 'Blue' }
        ]},
        { key: 'image', label: 'Thumbnail Image', type: 'image' },
        { key: 'video', label: 'Project Video (upload a file, or paste a YouTube link / direct .mp4 URL — optional)', type: 'video' },
        { key: 'featured', label: 'Pin to top of Home page (Home shows at least 6 projects automatically)', type: 'checkbox' },
        { key: 'published', label: 'Published (visible on the website — untick to keep it as a draft)', type: 'checkbox', defaultTrue: true }
      ],
      newItemDefaults: () => ({ id: genId(), title: '', category: 'longform', desc: '', tc: '', tone: 'orange', image: null, video: '', featured: false, published: true }),
      previewFn: (item) => ({
        title: item.title,
        meta: `${{ longform: 'Web Applications', reels: 'Landing Pages', color: 'E-commerce & Backend' }[item.category] || item.category} · ${item.tc}${item.video ? ' · Has video' : ''}${item.featured ? ' · Pinned on Home' : ''}${item.published === false ? ' · DRAFT' : ''}`,
        thumbStyle: item.image ? `background-image:url('${item.image}');background-size:cover;background-position:center;` : ''
      })
    });
  }

  /* ---------------- Websites For Sale manager ---------------- */
  function initWebsitesManager() {
    const categoryOptions = Object.keys(CMS.WEBSITE_CATEGORIES || {}).map(key => ({
      value: key, label: CMS.WEBSITE_CATEGORIES[key]
    }));
    createListManager({
      storeKey: 'websites',
      listElId: 'websitesList',
      editWrapId: 'websitesEditFormWrap',
      addBtnId: 'btnAddWebsite',
      singularLabel: 'Website',
      schema: [
        { key: 'title', label: 'Website Title', type: 'text' },
        { key: 'category', label: 'Category', type: 'select', options: categoryOptions },
        { key: 'price', label: 'Price (USD, numbers only)', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'video', label: 'Preview Video (upload a file, or paste a YouTube link / direct .mp4 URL — optional)', type: 'video' },
        { key: 'image', label: 'Thumbnail Image', type: 'image' },
        { key: 'featured', label: 'Pin to top of Home page (Home shows at least 6 websites automatically)', type: 'checkbox' },
        { key: 'published', label: 'Published (visible on the website — untick to keep it as a draft)', type: 'checkbox', defaultTrue: true }
      ],
      newItemDefaults: () => ({ id: genId(), title: '', category: categoryOptions[0] ? categoryOptions[0].value : 'business', price: '', desc: '', video: '', image: null, featured: false, published: true }),
      previewFn: (item) => ({
        title: item.title,
        meta: `${(CMS.WEBSITE_CATEGORIES && CMS.WEBSITE_CATEGORIES[item.category]) || item.category} · $${item.price || '0'}${item.video ? ' · Has preview video' : ''}${item.featured ? ' · Pinned on Home' : ''}${item.published === false ? ' · DRAFT' : ''}`,
        thumbStyle: item.image ? `background-image:url('${item.image}');background-size:cover;background-position:center;` : ''
      })
    });
  }

  /* ---------------- Services manager ---------------- */
  function initServicesManager() {
    createListManager({
      storeKey: 'services',
      listElId: 'servicesList',
      editWrapId: 'servicesEditFormWrap',
      addBtnId: 'btnAddService',
      singularLabel: 'Service',
      schema: [
        { key: 'title', label: 'Service Title', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'price', label: 'Starting Price (number only, e.g. 150)', type: 'text' },
        { key: 'unit', label: 'Unit (e.g. /project, /page, /month)', type: 'text' },
        { key: 'published', label: 'Published (visible on the website — untick to keep it as a draft)', type: 'checkbox', defaultTrue: true },
        { key: 'icon', label: 'Icon', type: 'select', options: [
          { value: 'film', label: 'Code Brackets' }, { value: 'phone', label: 'Browser Window' },
          { value: 'grade', label: 'Layers / Stack' }, { value: 'calendar', label: 'Calendar / Checklist' },
          { value: 'star', label: 'Star' }, { value: 'trophy', label: 'Trophy' }
        ]}
      ],
      newItemDefaults: () => ({ id: genId(), title: '', desc: '', price: '', unit: '/project', icon: 'film', published: true }),
      previewFn: (item) => ({ title: item.title, meta: `$${item.price}${item.unit}${item.published === false ? ' · DRAFT' : ''}`, iconSvg: CMS.iconSvg(item.icon, 24) })
    });
  }

  /* ---------------- Awards manager ---------------- */
  function initAwardsManager() {
    createListManager({
      storeKey: 'awards',
      listElId: 'awardsList',
      editWrapId: 'awardsEditFormWrap',
      addBtnId: 'btnAddAward',
      singularLabel: 'Award',
      schema: [
        { key: 'title', label: 'Award Title', type: 'text' },
        { key: 'year', label: 'Year', type: 'text' },
        { key: 'org', label: 'Awarded By', type: 'text' },
        { key: 'published', label: 'Published (visible on the website — untick to keep it as a draft)', type: 'checkbox', defaultTrue: true },
        { key: 'desc', label: 'Why It Matters', type: 'textarea' },
        { key: 'icon', label: 'Icon', type: 'select', options: [
          { value: 'trophy', label: 'Trophy' }, { value: 'star', label: 'Star' }, { value: 'mic', label: 'Microphone' }
        ]}
      ],
      newItemDefaults: () => ({ id: genId(), title: '', year: '', org: '', desc: '', icon: 'trophy', published: true }),
      previewFn: (item) => ({ title: item.title, meta: `${item.year} · ${item.org}${item.published === false ? ' · DRAFT' : ''}`, iconSvg: CMS.iconSvg(item.icon, 24) })
    });
  }

  /* =================================================================
     HOME PAGE FORM
     ================================================================= */
  function initHomeForm() {
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const home = content.home || CMS.DEFAULTS.content.home;
    document.getElementById('homeRoleLeft').value = home.heroRoleLeft;
    document.getElementById('homeRoleRight').value = home.heroRoleRight;
    document.getElementById('homeTagline').value = home.heroTagline;
    document.getElementById('homeStatsVideos').value = home.statsVideos;
    document.getElementById('homeStatsClients').value = home.statsClients;
    document.getElementById('homeStatsYears').value = home.statsYears;
    document.getElementById('homeStatsRating').value = home.statsRating;
    document.getElementById('homeServicesTitle').value = home.servicesSectionTitle;
    document.getElementById('homeCtaTitle').value = home.ctaTitle;
    document.getElementById('homeCtaSub').value = home.ctaSub;
    const showBrandsCb = document.getElementById('homeShowBrands');
    if (showBrandsCb) showBrandsCb.checked = home.showBrands !== false;

    document.getElementById('formHome').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      c.home = {
        heroRoleLeft: document.getElementById('homeRoleLeft').value,
        heroRoleRight: document.getElementById('homeRoleRight').value,
        heroTagline: document.getElementById('homeTagline').value,
        statsVideos: document.getElementById('homeStatsVideos').value,
        statsClients: document.getElementById('homeStatsClients').value,
        statsYears: document.getElementById('homeStatsYears').value,
        statsRating: document.getElementById('homeStatsRating').value,
        servicesSectionTitle: document.getElementById('homeServicesTitle').value,
        ctaTitle: document.getElementById('homeCtaTitle').value,
        ctaSub: document.getElementById('homeCtaSub').value,
        showBrands: showBrandsCb ? showBrandsCb.checked : true
      };
      CMS.set(CMS.KEYS.content, c);
      toast('Home page saved');
      pulseSaveDot();
    });
  }

  /* =================================================================
     ABOUT SECTION (text + paragraphs + milestones + skills)
     ================================================================= */
  function initAboutSection() {
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const about = content.about || CMS.DEFAULTS.content.about;
    document.getElementById('aboutPageTitle').value = about.pageTitle;

    let paragraphs = JSON.parse(JSON.stringify(about.paragraphs));
    const wrap = document.getElementById('aboutParagraphsWrap');

    function renderParagraphs() {
      wrap.innerHTML = paragraphs.map((p, i) => `
        <div class="admin-editform" style="margin-bottom:12px;">
          <label>Paragraph ${i + 1}</label>
          <textarea data-para-text="${i}" rows="3">${esc(p.text)}</textarea>
          <div class="admin-checkbox-row" style="margin-top:12px; justify-content:space-between;">
            <span style="display:flex; align-items:center; gap:10px;">
              <input type="checkbox" data-para-highlight="${i}" id="hl_${i}" ${p.highlight ? 'checked' : ''}>
              <label for="hl_${i}" style="margin:0;">Highlight (pull-quote style)</label>
            </span>
            <button type="button" class="admin-icon-btn danger" data-remove-para="${i}" title="Remove paragraph">${ICON_TRASH}</button>
          </div>
        </div>`).join('');
      wrap.querySelectorAll('[data-remove-para]').forEach(btn => {
        btn.addEventListener('click', () => {
          syncFromDom();
          paragraphs.splice(Number(btn.dataset.removePara), 1);
          renderParagraphs();
        });
      });
    }
    function syncFromDom() {
      wrap.querySelectorAll('[data-para-text]').forEach(ta => {
        paragraphs[Number(ta.dataset.paraText)].text = ta.value;
      });
      wrap.querySelectorAll('[data-para-highlight]').forEach(cb => {
        paragraphs[Number(cb.dataset.paraHighlight)].highlight = cb.checked;
      });
    }
    renderParagraphs();

    document.getElementById('btnAddParagraph').addEventListener('click', () => {
      syncFromDom();
      paragraphs.push({ text: '', highlight: false });
      renderParagraphs();
    });

    document.getElementById('formAboutText').addEventListener('submit', (e) => {
      e.preventDefault();
      syncFromDom();
      const c = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      c.about = { pageTitle: document.getElementById('aboutPageTitle').value, paragraphs: paragraphs };
      CMS.set(CMS.KEYS.content, c);
      toast('About page saved');
      pulseSaveDot();
    });

    createListManager({
      storeKey: 'milestones',
      listElId: 'milestonesList',
      editWrapId: 'milestonesEditFormWrap',
      addBtnId: 'btnAddMilestone',
      singularLabel: 'Milestone',
      schema: [
        { key: 'title', label: 'Milestone Title', type: 'text' },
        { key: 'year', label: 'Year / Stage Label', type: 'text' },
        { key: 'desc', label: 'Description', type: 'textarea' },
        { key: 'icon', label: 'Icon', type: 'select', options: [
          { value: 'play', label: 'Lightbulb' }, { value: 'compass', label: 'Compass' }, { value: 'film', label: 'Code Brackets' },
          { value: 'calendar', label: 'Calendar' }, { value: 'star', label: 'Star' }, { value: 'trophy', label: 'Trophy' }
        ]}
      ],
      newItemDefaults: () => ({ id: genId(), title: '', year: '', desc: '', icon: 'star' }),
      previewFn: (item) => ({ title: item.title, meta: item.year, iconSvg: CMS.iconSvg(item.icon, 24) })
    });

    createListManager({
      storeKey: 'skills',
      listElId: 'skillsList',
      editWrapId: 'skillsEditFormWrap',
      addBtnId: 'btnAddSkill',
      singularLabel: 'Skill',
      schema: [
        { key: 'name', label: 'Skill Name', type: 'text' },
        { key: 'value', label: 'Level (0–100)', type: 'number', min: 0, max: 100 }
      ],
      newItemDefaults: () => ({ id: genId(), name: '', value: 80 }),
      previewFn: (item) => ({ title: item.name, meta: item.value + '%', thumbText: `<span style="font-family:var(--font-mono);font-size:12px;">${item.value}%</span>` })
    });
  }

  /* =================================================================
     SERVICES / AWARDS PAGE TEXT
     ================================================================= */
  function initServicesText() {
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const s = content.services || CMS.DEFAULTS.content.services;
    document.getElementById('servicesPageTitle').value = s.pageTitle;
    document.getElementById('servicesPageSub').value = s.pageSub;
    document.getElementById('servicesNote').value = s.note;
    document.getElementById('formServicesText').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      c.services = {
        pageTitle: document.getElementById('servicesPageTitle').value,
        pageSub: document.getElementById('servicesPageSub').value,
        note: document.getElementById('servicesNote').value
      };
      CMS.set(CMS.KEYS.content, c);
      toast('Services page text saved');
      pulseSaveDot();
    });
  }
  function initAwardsText() {
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const a = content.awards || CMS.DEFAULTS.content.awards;
    document.getElementById('awardsPageTitle').value = a.pageTitle;
    document.getElementById('awardsPageSub').value = a.pageSub;
    document.getElementById('formAwardsText').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      c.awards = {
        pageTitle: document.getElementById('awardsPageTitle').value,
        pageSub: document.getElementById('awardsPageSub').value
      };
      CMS.set(CMS.KEYS.content, c);
      toast('Awards page text saved');
      pulseSaveDot();
    });
  }
  // hook these into the manager init calls
  const _origInitServicesManager = initServicesManager;
  initServicesManager = function () { initServicesText(); _origInitServicesManager(); };
  const _origInitAwardsManager = initAwardsManager;
  initAwardsManager = function () { initAwardsText(); _origInitAwardsManager(); };

  /* =================================================================
     CONTACT SECTION
     ================================================================= */
  function initContactSection() {
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const c = content.contact || CMS.DEFAULTS.content.contact;
    document.getElementById('contactPageTitle').value = c.pageTitle;
    document.getElementById('contactPageSub').value = c.pageSub;

    document.getElementById('formContactText').addEventListener('submit', (e) => {
      e.preventDefault();
      const full = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      full.contact = {
        pageTitle: document.getElementById('contactPageTitle').value,
        pageSub: document.getElementById('contactPageSub').value
      };
      CMS.set(CMS.KEYS.content, full);
      toast('Contact page text saved');
      pulseSaveDot();
    });

    const info = CMS.get(CMS.KEYS.contactInfo, CMS.DEFAULTS.contactInfo);
    document.getElementById('infoEmail').value = info.email;
    document.getElementById('infoWhatsapp').value = info.whatsapp;
    document.getElementById('infoInstagram').value = info.instagram === '#' ? '' : info.instagram;
    document.getElementById('infoYoutube').value = info.youtube === '#' ? '' : info.youtube;

    document.getElementById('formContactInfo').addEventListener('submit', (e) => {
      e.preventDefault();
      const newInfo = {
        email: document.getElementById('infoEmail').value,
        whatsapp: document.getElementById('infoWhatsapp').value,
        instagram: document.getElementById('infoInstagram').value || '#',
        youtube: document.getElementById('infoYoutube').value || '#'
      };
      CMS.set(CMS.KEYS.contactInfo, newInfo);
      toast('Contact details saved');
      pulseSaveDot();
    });
  }

  /* =================================================================
     MESSAGES SECTION — contact form submissions + analytics
     ================================================================= */
  const PROJECT_TYPE_LABELS = {
    youtube: 'Website Development',
    reels: 'Web Application Development',
    color: 'API & Backend Development',
    channel: 'Website Maintenance & Support',
    other: 'Something Else'
  };
  const BUDGET_LABELS = {
    'under-100': 'Under $100',
    '100-300': '$100 – $300',
    '300-600': '$300 – $600',
    '600-plus': '$600+ / month',
    'not-sure': 'Not sure yet'
  };

  function initMessagesManager() {
    const listEl = document.getElementById('messagesList');
    if (!listEl) return;
    const root = document.getElementById('section-messages');
    const statsGrid = document.getElementById('msgStatsGrid');
    const byTypeEl = document.getElementById('msgByType');
    const byBudgetEl = document.getElementById('msgByBudget');
    const trendEl = document.getElementById('msgTrendChart');
    const markAllBtn = document.getElementById('btnMarkAllRead');
    const clearBtn = document.getElementById('btnClearMessages');
    const searchEl = document.getElementById('msgSearch');
    const statusEl = document.getElementById('msgStatusFilter');
    const typeEl = document.getElementById('msgTypeFilter');
    const pagerEl = document.getElementById('messagesPager');
    const sourceBadge = document.getElementById('messagesSourceBadge');
    let expandedId = null;
    let page = 1;
    let items = [];
    let searchTimer = null;

    Object.keys(PROJECT_TYPE_LABELS).forEach((k) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = PROJECT_TYPE_LABELS[k];
      typeEl.appendChild(o);
    });

    function setSource(ok) {
      if (!sourceBadge) return;
      sourceBadge.classList.toggle('is-remote', ok);
      sourceBadge.classList.toggle('is-error', !ok);
      sourceBadge.textContent = ok ? 'Live database' : 'Connection error';
    }

    function breakdown(el, labels, counts, total) {
      const keys = Object.keys(labels);
      const max = Math.max(1, ...keys.map((k) => counts[k] || 0));
      el.innerHTML = total ? keys.map((k) => {
        const count = counts[k] || 0;
        const pct = Math.round((count / max) * 100);
        return `<div class="breakdown-row">
          <span class="breakdown-label">${esc(labels[k])}</span>
          <span class="breakdown-bar-track"><span class="breakdown-bar-fill" style="width:${pct}%"></span></span>
          <span class="breakdown-count">${count}</span>
        </div>`;
      }).join('') : '<p class="admin-empty">No data yet</p>';
    }

    function renderStats(st) {
      statsGrid.innerHTML = `
        <div class="overview-tile"><span class="overview-num">${st.total}</span><span class="overview-label">Total Messages</span></div>
        <div class="overview-tile"><span class="overview-num">${st.unread}</span><span class="overview-label">Unread</span></div>
        <div class="overview-tile"><span class="overview-num">${st.week}</span><span class="overview-label">This Week</span></div>
        <div class="overview-tile"><span class="overview-num">${st.month}</span><span class="overview-label">This Month</span></div>`;
      breakdown(byTypeEl, PROJECT_TYPE_LABELS, st.byType || {}, st.total);
      breakdown(byBudgetEl, BUDGET_LABELS, st.byBudget || {}, st.total);
      const max = Math.max(1, ...st.daily.map((d) => d.count));
      trendEl.innerHTML = st.daily.map((d) => {
        const h = d.count ? Math.max(6, Math.round((d.count / max) * 100)) : 3;
        const dt = new Date(d.date + 'T00:00:00');
        const label = (dt.getMonth() + 1) + '/' + dt.getDate();
        return `<div class="trend-bar-wrap" title="${d.count} on ${label}">
          <div class="trend-bar" style="height:${h}%"></div>
          <span class="trend-bar-label">${label}</span>
        </div>`;
      }).join('');
    }

    async function loadStats() {
      const st = await API.messageStats();
      if (!st) { setSource(false); return; }
      setSource(true);
      renderStats(st);
      const badge = document.getElementById('navMsgBadge');
      if (badge) { badge.textContent = st.unread > 99 ? '99+' : String(st.unread); badge.hidden = st.unread === 0; }
    }

    async function loadPage() {
      const data = await API.listMessages({
        page, limit: 15,
        search: searchEl.value.trim(), status: statusEl.value, projectType: typeEl.value
      });
      if (!data) {
        setSource(false);
        listEl.innerHTML = '<p class="admin-empty">Could not load messages from the server. <button type="button" class="btn btn-ghost" id="msgRetry" style="padding:6px 14px;font-size:12.5px;">Retry</button></p>';
        const retry = document.getElementById('msgRetry');
        if (retry) retry.addEventListener('click', loadPage);
        return;
      }
      setSource(true);
      // If the last message on a page was deleted, step back a page.
      if (data.items.length === 0 && data.pagination.page > 1) { page = Math.max(1, data.pagination.totalPages); return loadPage(); }
      items = data.items;
      renderList();
      renderPager(pagerEl, data.pagination, (p) => { page = p; loadPage(); });
    }

    function refresh() { loadStats(); loadPage(); }

    function renderList() {
      const filtered = searchEl.value.trim() || statusEl.value || typeEl.value;
      if (!items.length) {
        listEl.innerHTML = filtered
          ? '<p class="admin-empty">No messages match these filters.</p>'
          : '<p class="admin-empty">No messages yet — they\'ll show up here the moment someone submits your live Contact form.</p>';
        return;
      }
      listEl.innerHTML = items.map((m) => {
        const initial = (m.name || '?').trim().charAt(0).toUpperCase() || '?';
        const isExpanded = m.id === expandedId;
        return `
        <div class="admin-list-item msg-item ${m.read ? '' : 'is-unread'}" data-id="${esc(m.id)}">
          <div class="msg-avatar">${esc(initial)}</div>
          <div class="msg-body" data-role="body">
            <div class="msg-top-row">
              ${m.read ? '' : '<span class="msg-unread-dot"></span>'}
              <span class="msg-name">${esc(m.name || 'Unknown')}</span>
              <span class="msg-email">${esc(m.email || '')}</span>
            </div>
            <div class="msg-meta-row">
              <span class="msg-tag">${esc(PROJECT_TYPE_LABELS[m.projectType] || m.projectType || '—')}</span>
              <span class="msg-tag">${esc(BUDGET_LABELS[m.budget] || m.budget || '—')}</span>
              <span>${esc(timeAgoIso(m.createdAt))}</span>
              <span class="msg-id" title="Message ID ${esc(m.id)}">#${esc(String(m.id).slice(0, 8))}</span>
            </div>
            <div class="msg-preview" data-role="preview" ${isExpanded ? 'hidden' : ''}>${esc((m.message || '').slice(0, 90))}${(m.message || '').length > 90 ? '…' : ''}</div>
            <div class="msg-full" data-role="full" ${isExpanded ? '' : 'hidden'}>${esc(m.message || '')}
              ${isExpanded ? `<div class="msg-full-meta">Received ${esc(new Date(m.createdAt).toLocaleString())} · <a href="mailto:${esc(m.email)}">Reply by email</a></div>` : ''}</div>
          </div>
          <div class="msg-actions">
            <button type="button" class="admin-icon-btn" data-action="toggle-read" title="${m.read ? 'Mark unread' : 'Mark read'}">
              ${m.read
                ? '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/></svg>'
                : '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
            </button>
            <button type="button" class="admin-icon-btn" data-action="delete" title="Delete">${ICON_TRASH}</button>
          </div>
        </div>`;
      }).join('');

      listEl.querySelectorAll('.msg-item').forEach((row) => {
        const id = row.dataset.id;
        row.querySelector('[data-role="body"]').addEventListener('click', async () => {
          const wasExpanded = expandedId === id;
          expandedId = wasExpanded ? null : id;
          const found = items.find((x) => x.id === id);
          if (!wasExpanded && found && !found.read) {
            found.read = true;
            renderList();
            if (!(await API.setMessageRead(id, true))) { found.read = false; toast('Could not update the message'); renderList(); }
            loadStats();
            return;
          }
          renderList();
        });
        row.querySelector('[data-action="toggle-read"]').addEventListener('click', async (e) => {
          e.stopPropagation();
          const found = items.find((x) => x.id === id);
          if (!found) return;
          const next = !found.read;
          if (await API.setMessageRead(id, next)) {
            found.read = next;
            renderList();
            loadStats();
            toast(next ? 'Marked as read' : 'Marked as unread');
          } else toast('Could not update the message');
        });
        row.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this message? This cannot be undone.')) return;
          if (await API.deleteMessage(id)) { toast('Message deleted'); refresh(); }
          else toast('Could not delete the message');
        });
      });
    }

    markAllBtn.addEventListener('click', async () => {
      if (await API.markAllMessagesRead()) { toast('All messages marked as read'); refresh(); }
      else toast('Could not update messages');
    });
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Delete ALL messages? This cannot be undone.')) return;
      if (await API.deleteAllMessages()) { toast('All messages cleared'); page = 1; refresh(); }
      else toast('Could not delete messages');
    });
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { page = 1; loadPage(); }, 300);
    });
    [statusEl, typeEl].forEach((el) => el.addEventListener('change', () => { page = 1; loadPage(); }));

    sectionHooks.messages = refresh;
    refresh();
    // New messages from the public Contact form show up without a manual refresh.
    API.poll(() => { if (!root.hidden) refresh(); }, 20000);
  }

  /* =================================================================
     REVIEWS SECTION — moderate "Write a Review" submissions
     ================================================================= */
  function initReviewsManager() {
    const listEl = document.getElementById('reviewsList');
    if (!listEl) return;
    const statsGrid = document.getElementById('reviewStatsGrid');
    const badgeEl = document.getElementById('navReviewBadge');
    const root = document.getElementById('section-reviews');
    let items = [];

    function updateBadge() {
      const pending = items.filter((r) => !r.approved).length;
      if (!badgeEl) return;
      badgeEl.textContent = pending > 99 ? '99+' : String(pending);
      badgeEl.hidden = pending === 0;
    }

    function starsHtml(rating) {
      const r = Math.max(1, Math.min(5, rating || 5));
      return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
    }

    function renderStats() {
      const total = items.length;
      const pending = items.filter((r) => !r.approved).length;
      const approvedItems = items.filter((r) => r.approved);
      const approved = approvedItems.length;
      const avg = approved ? (approvedItems.reduce((sum, r) => sum + (r.rating || 0), 0) / approved).toFixed(1) : '—';
      statsGrid.innerHTML = `
        <div class="overview-tile"><span class="overview-num">${total}</span><span class="overview-label">Total Testimonials</span></div>
        <div class="overview-tile"><span class="overview-num">${pending}</span><span class="overview-label">Pending Approval</span></div>
        <div class="overview-tile"><span class="overview-num">${approved}</span><span class="overview-label">Live on Site</span></div>
        <div class="overview-tile"><span class="overview-num">${avg}</span><span class="overview-label">Average Rating</span></div>`;
    }

    async function load() {
      const data = await API.listReviews();
      if (!data) {
        listEl.innerHTML = '<p class="admin-empty">Could not load testimonials from the server.</p>';
        return;
      }
      items = data.items;
      renderList();
    }

    function renderList() {
      renderStats();
      updateBadge();
      if (!items.length) {
        listEl.innerHTML = '<p class="admin-empty">No testimonials yet — they\'ll show up here when a visitor uses the "Write a Review" button on your Home page.</p>';
        return;
      }
      listEl.innerHTML = items.map((r) => {
        const initial = (r.name || '?').trim().charAt(0).toUpperCase() || '?';
        return `
        <div class="admin-list-item msg-item ${r.approved ? '' : 'is-unread'}" data-id="${esc(r.id)}">
          <div class="msg-avatar">${esc(initial)}</div>
          <div class="msg-body">
            <div class="msg-top-row">
              <span class="msg-name">${esc(r.name || 'Anonymous')}</span>
              <span class="msg-tag" style="color:var(--orange-soft);letter-spacing:1px;">${starsHtml(r.rating)}</span>
            </div>
            <div class="msg-meta-row">
              <span class="msg-tag">${r.approved ? 'Live on site' : 'Pending approval'}</span>
              <span>${esc(timeAgoIso(r.createdAt))}</span>
            </div>
            <div class="msg-preview">${esc(r.message || '')}</div>
          </div>
          <div class="msg-actions">
            <button type="button" class="admin-icon-btn" data-action="toggle-approve" title="${r.approved ? 'Unpublish' : 'Approve'}">
              ${r.approved
                ? '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.4"/></svg>'
                : '<svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
            </button>
            <button type="button" class="admin-icon-btn" data-action="delete" title="Delete">${ICON_TRASH}</button>
          </div>
        </div>`;
      }).join('');

      listEl.querySelectorAll('.msg-item').forEach((row) => {
        const id = row.dataset.id;
        row.querySelector('[data-action="toggle-approve"]').addEventListener('click', async () => {
          const found = items.find((x) => x.id === id);
          if (!found) return;
          const next = !found.approved;
          if (await API.setReviewApproved(id, next)) {
            toast(next ? 'Testimonial approved — now live on the Home page' : 'Testimonial unpublished');
            load();
          } else toast('Could not update the testimonial');
        });
        row.querySelector('[data-action="delete"]').addEventListener('click', async () => {
          if (!confirm('Delete this testimonial? This cannot be undone.')) return;
          if (await API.deleteReview(id)) { toast('Testimonial deleted'); load(); }
          else toast('Could not delete the testimonial');
        });
      });
    }

    sectionHooks.reviews = load;
    load();
    API.poll(() => { if (!root.hidden) load(); }, 30000);
  }

  /* =================================================================
     SITE NAME (Settings section)
     ================================================================= */
  function initSiteNameForm() {
    const form = document.getElementById('formSiteName');
    if (!form) return;
    const content = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
    const global = content.global || CMS.DEFAULTS.content.global;
    document.getElementById('siteNameInput').value = global.siteName;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('siteNameInput').value.trim();
      if (!val) { toast("Website name can't be empty"); return; }
      const full = CMS.get(CMS.KEYS.content, CMS.DEFAULTS.content);
      full.global = { siteName: val };
      CMS.set(CMS.KEYS.content, full);
      CMS.renderAll(); // refresh this tab's own sidebar/login logo immediately too
      toast('Website name updated — live on site');
      pulseSaveDot();
    });
  }

  /* =================================================================
     IMAGES SECTION
     ================================================================= */
  function initImagesSection() {
    const images = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
    const homePreview = document.getElementById('previewHomePhoto');
    const aboutPreview = document.getElementById('previewAboutPhoto');

    function paint() {
      const imgs = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
      if (imgs.homePhoto) { homePreview.style.backgroundImage = `url('${imgs.homePhoto}')`; homePreview.style.backgroundSize = 'cover'; homePreview.style.backgroundPosition = 'center'; homePreview.textContent = ''; }
      else { homePreview.style.backgroundImage = ''; homePreview.textContent = 'No photo'; }
      if (imgs.aboutPhoto) { aboutPreview.style.backgroundImage = `url('${imgs.aboutPhoto}')`; aboutPreview.style.backgroundSize = 'cover'; aboutPreview.style.backgroundPosition = 'center'; aboutPreview.textContent = ''; }
      else { aboutPreview.style.backgroundImage = ''; aboutPreview.textContent = 'No photo'; }
    }
    paint();

    document.getElementById('uploadHomePhoto').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await resizeImageToDataURL(file, 900, 0.85);
      const imgs = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
      imgs.homePhoto = dataUrl;
      CMS.set(CMS.KEYS.images, imgs);
      paint();
      toast('Home photo updated');
      pulseSaveDot();
    });
    document.getElementById('removeHomePhoto').addEventListener('click', () => {
      const imgs = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
      imgs.homePhoto = null;
      CMS.set(CMS.KEYS.images, imgs);
      paint();
      toast('Home photo removed');
      pulseSaveDot();
    });
    document.getElementById('uploadAboutPhoto').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const dataUrl = await resizeImageToDataURL(file, 900, 0.85);
      const imgs = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
      imgs.aboutPhoto = dataUrl;
      CMS.set(CMS.KEYS.images, imgs);
      paint();
      toast('About photo updated');
      pulseSaveDot();
    });
    document.getElementById('removeAboutPhoto').addEventListener('click', () => {
      const imgs = CMS.get(CMS.KEYS.images, CMS.DEFAULTS.images);
      imgs.aboutPhoto = null;
      CMS.set(CMS.KEYS.images, imgs);
      paint();
      toast('About photo removed');
      pulseSaveDot();
    });
  }

  /* =================================================================
     MEDIA LIBRARY — every uploaded image and video
     ================================================================= */
  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function initMediaSection() {
    const grid = document.getElementById('mediaGrid');
    if (!grid) return;
    const pagerEl = document.getElementById('mediaPager');
    const uploadInput = document.getElementById('mediaUploadInput');
    const typeFilter = document.getElementById('mediaTypeFilter');
    const statusEl = document.getElementById('mediaUploadStatus');
    let page = 1;

    async function load() {
      const data = await API.listMedia({ page, limit: 24, type: typeFilter.value });
      if (!data) { grid.innerHTML = '<p class="admin-empty">Could not load the media library from the server.</p>'; return; }
      if (!data.items.length && data.pagination.page > 1) { page = Math.max(1, data.pagination.totalPages); return load(); }
      if (!data.items.length) {
        grid.innerHTML = '<p class="admin-empty">No files yet. Upload an image or video, or add one from a project or photo field.</p>';
        pagerEl.innerHTML = '';
        return;
      }
      grid.innerHTML = data.items.map((m) => `
        <div class="media-card" data-id="${esc(m.id)}">
          <div class="media-thumb">
            ${m.type === 'video'
              ? `<video src="${esc(m.url)}" preload="metadata" muted playsinline></video><span class="media-badge">VIDEO</span>`
              : `<img src="${esc(m.url)}" alt="${esc(m.originalName || 'Uploaded image')}" loading="lazy">`}
          </div>
          <div class="media-info">
            <p class="media-name" title="${esc(m.originalName || m.filename)}">${esc(m.originalName || m.filename)}</p>
            <p class="media-meta">${formatBytes(m.size)}${m.width ? ` · ${m.width}×${m.height}` : ''} · ${m.usageCount ? `used ${m.usageCount}×` : 'unused'}</p>
          </div>
          <div class="media-actions">
            <button type="button" class="btn btn-ghost" data-act="copy" style="padding:6px 12px;font-size:12px;">Copy URL</button>
            <button type="button" class="admin-icon-btn danger" data-act="delete" title="Delete">${ICON_TRASH}</button>
          </div>
        </div>`).join('');
      grid.querySelectorAll('.media-card').forEach((card) => {
        const id = card.dataset.id;
        const item = data.items.find((x) => x.id === id);
        card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(new URL(item.url, window.location.origin).href); toast('URL copied'); }
          catch (e) { window.prompt('Copy this URL:', item.url); }
        });
        card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
          if (!confirm('Delete this file? This cannot be undone.')) return;
          let r = await API.deleteMedia(id, false);
          if (!r.ok && r.inUse) {
            if (!confirm('This file is still used on the site. Deleting it will leave a broken image or video there. Delete it anyway?')) return;
            r = await API.deleteMedia(id, true);
          }
          if (r.ok) { toast('File deleted'); load(); } else toast(r.error || 'Could not delete the file');
        });
      });
      renderPager(pagerEl, data.pagination, (p) => { page = p; load(); });
    }

    uploadInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      let done = 0, failed = 0;
      for (const file of files) {
        statusEl.textContent = `Uploading ${done + failed + 1} of ${files.length}: ${file.name}…`;
        const r = await API.uploadFile(file, (frac) => {
          statusEl.textContent = `Uploading ${done + failed + 1} of ${files.length}: ${file.name} — ${Math.round(frac * 100)}%`;
        });
        if (r.ok) done++; else { failed++; toast(file.name + ': ' + (r.error || 'upload failed')); }
      }
      statusEl.textContent = `${done} uploaded${failed ? `, ${failed} failed` : ''}.`;
      if (done) { page = 1; load(); }
    });
    typeFilter.addEventListener('change', () => { page = 1; load(); });

    sectionHooks.media = load;
    load();
  }

  /* =================================================================
     ACTIVITY LOG
     ================================================================= */
  function initActivitySection() {
    const listEl = document.getElementById('activityList');
    if (!listEl) return;
    const pagerEl = document.getElementById('activityPager');
    let page = 1;

    async function load() {
      const data = await API.getActivity({ page, limit: 25 });
      if (!data) { listEl.innerHTML = '<p class="admin-empty">Could not load the activity log from the server.</p>'; return; }
      if (!data.items.length) { listEl.innerHTML = '<p class="admin-empty">No activity recorded yet.</p>'; pagerEl.innerHTML = ''; return; }
      listEl.innerHTML = data.items.map((a) => `
        <div class="admin-list-item">
          <div class="admin-list-body">
            <p class="admin-list-title">${esc(describeActivity(a))}</p>
            <p class="admin-list-meta">${esc(a.adminName || 'system')} · ${esc(new Date(a.createdAt).toLocaleString())}${a.ip ? ' · ' + esc(a.ip) : ''}</p>
          </div>
        </div>`).join('');
      renderPager(pagerEl, data.pagination, (p) => { page = p; load(); });
    }

    sectionHooks.activity = load;
    load();
  }

  /* =================================================================
     ADMIN PROFILE — username / email / password
     ================================================================= */
  function initProfileSection() {
    const who = document.getElementById('profileWho');
    const uEl = document.getElementById('profileUsername');
    const eEl = document.getElementById('profileEmail');
    const profileMsg = document.getElementById('profileMsg');
    const pwMsg = document.getElementById('settingsMsg');

    function paintUser(u) {
      if (!u) return;
      currentUser = u;
      who.textContent = u.username + ' (' + u.email + ')';
      uEl.value = u.username;
      eEl.value = u.email;
    }
    paintUser(currentUser);

    function say(el, ok, text) {
      el.textContent = text;
      el.style.color = ok ? 'var(--blue-soft)' : 'var(--orange-soft)';
    }

    document.getElementById('formProfile').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwEl = document.getElementById('profileCurrentPassword');
      const r = await API.updateProfile({ username: uEl.value.trim(), email: eEl.value.trim(), currentPassword: pwEl.value });
      pwEl.value = '';
      if (r.ok) { paintUser(r.user); say(profileMsg, true, 'Account details updated.'); toast('Account details updated'); }
      else say(profileMsg, false, (r.details && r.details.length ? r.details.map((d) => d.message).join(' ') : r.error) || 'Could not update your details.');
    });

    document.getElementById('formChangePassword').addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = document.getElementById('currentPassword').value;
      const next = document.getElementById('newPassword').value;
      const confirmVal = document.getElementById('confirmPassword').value;
      if (next.length < 10) return say(pwMsg, false, 'New password must be at least 10 characters.');
      if (next !== confirmVal) return say(pwMsg, false, 'New password and confirmation do not match.');
      const r = await API.changePassword(current, next);
      if (r.ok) {
        say(pwMsg, true, 'Password updated. Other devices have been signed out.');
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach((id) => { document.getElementById(id).value = ''; });
        toast('Password updated');
      } else say(pwMsg, false, (r.details && r.details.length ? r.details.map((d) => d.message).join(' ') : r.error) || 'Could not change the password.');
    });
  }

  /* =================================================================
     THEME SECTION
     ================================================================= */
  const THEME_DEFS = [
    { key: 'charcoal-orange', name: 'Charcoal Orange', bg: '#0E0C0A', a: '#FF5A1F', b: '#2FB6FF' },
    { key: 'midnight-blue', name: 'Midnight Blue', bg: '#080B14', a: '#3B82F6', b: '#22D3EE' },
    { key: 'slate-purple', name: 'Slate Purple', bg: '#0F0D16', a: '#A855F7', b: '#818CF8' },
    { key: 'emerald-dark', name: 'Emerald Dark', bg: '#080F0B', a: '#10B981', b: '#F59E0B' },
    { key: 'crimson-noir', name: 'Crimson Noir', bg: '#120808', a: '#E11D48', b: '#FBBF24' },
    { key: 'amber-bronze', name: 'Amber Bronze', bg: '#120D06', a: '#D97706', b: '#2DD4BF' },
    { key: 'cyber-teal', name: 'Cyber Teal', bg: '#050F0F', a: '#14B8A6', b: '#C084FC' },
    { key: 'rosewood-pink', name: 'Rosewood Pink', bg: '#120910', a: '#EC4899', b: '#38BDF8' },
    { key: 'arctic-frost', name: 'Arctic Frost', bg: '#060B10', a: '#38BDF8', b: '#A5B4FC' }
  ];
  function initThemeSection() {
    const grid = document.getElementById('themeGrid');
    function render() {
      const current = CMS.get(CMS.KEYS.theme, CMS.DEFAULTS.theme);
      grid.innerHTML = THEME_DEFS.map(t => `
        <button type="button" class="theme-swatch ${t.key === current ? 'is-active' : ''}" data-theme-key="${t.key}">
          <span class="theme-preview" style="background:${t.bg};">
            <span style="background:${t.a};"></span><span style="background:${t.b};"></span><span style="background:${t.bg};"></span>
          </span>
          <span class="theme-swatch-label">
            <span class="theme-swatch-name">${t.name}</span>
            <span class="theme-active-badge">Active</span>
          </span>
        </button>`).join('');
      grid.querySelectorAll('[data-theme-key]').forEach(btn => {
        btn.addEventListener('click', () => {
          CMS.set(CMS.KEYS.theme, btn.dataset.themeKey);
          document.documentElement.setAttribute('data-theme', btn.dataset.themeKey === 'charcoal-orange' ? '' : btn.dataset.themeKey);
          if (btn.dataset.themeKey === 'charcoal-orange') document.documentElement.removeAttribute('data-theme');
          render();
          renderOverview();
          toast(`Theme changed to ${THEME_LABELS[btn.dataset.themeKey]} — live on the whole site`);
          pulseSaveDot();
        });
      });
    }
    render();
  }

  /* =================================================================
     PAGE VISIBILITY SECTION
     ================================================================= */
  function initPagesSection() {
    const listEl = document.getElementById('pageVisibilityList');
    if (!listEl) return;

    const PAGE_ITEMS = [
      { key: 'home', title: 'Home Page', file: 'index.html', desc: 'Hero section, stats, featured work grid, and CTA' },
      { key: 'portfolio', title: 'Portfolio Page', file: 'portfolio.html', desc: 'Full portfolio showcase and category filters' },
      { key: 'services', title: 'Services & Pricing', file: 'services.html', desc: 'Services cards, pricing information, and quotes' },
      { key: 'websites', title: 'Websites For Sale', file: 'websites.html', desc: 'Ready-made website listings by category, with pricing and video previews' },
      { key: 'awards', title: 'Awards & Achievements', file: 'awards.html', desc: 'Milestone achievements and awards timeline' },
      { key: 'about', title: 'About Page', file: 'about.html', desc: 'Personal story, core skills, and background' },
      { key: 'contact', title: 'Contact Page', file: 'contact.html', desc: 'Contact details, direct email, and inquiry form' }
    ];

    function render() {
      const pages = CMS.get(CMS.KEYS.pages, CMS.DEFAULTS.pages);
      listEl.innerHTML = PAGE_ITEMS.map(p => {
        const isEnabled = pages[p.key] !== false;
        return `
          <div class="page-vis-card ${isEnabled ? 'is-active' : 'is-disabled'}">
            <div class="page-vis-main">
              <div class="page-vis-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4" width="17" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 9h17M9 9v11" stroke="currentColor" stroke-width="1.6"/></svg>
              </div>
              <div>
                <h4 class="page-vis-title">${esc(p.title)} <span class="page-vis-url">(${esc(p.file)})</span></h4>
                <p class="admin-card-sub" style="margin-bottom:0; font-size:12.5px;">${esc(p.desc)}</p>
              </div>
            </div>
            <div class="page-vis-right">
              <span class="page-status-badge ${isEnabled ? 'status-enabled' : 'status-disabled'}">${isEnabled ? 'Active' : 'Disabled'}</span>
              <label class="switch-toggle" title="Toggle page visibility">
                <input type="checkbox" data-pagekey="${p.key}" ${isEnabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('input[data-pagekey]').forEach(input => {
        input.addEventListener('change', (e) => {
          const key = e.target.dataset.pagekey;
          const currentPages = CMS.get(CMS.KEYS.pages, CMS.DEFAULTS.pages);
          currentPages[key] = e.target.checked;
          CMS.set(CMS.KEYS.pages, currentPages);
          toast(`${PAGE_ITEMS.find(i => i.key === key).title} is now ${e.target.checked ? 'Active' : 'Disabled'}`);
          pulseSaveDot();
          render();
          renderOverview();
        });
      });
    }

    render();
  }

  /* =================================================================
     ANALYTICS SECTION
     ================================================================= */
  function initAnalyticsSection() {
    const root = document.getElementById('section-analytics');
    if (!root) return;

    const PAGE_LABELS = {
      home: 'Home', portfolio: 'Portfolio', services: 'Services',
      websites: 'Websites For Sale', awards: 'Awards', about: 'About', contact: 'Contact'
    };
    const DEVICE_ICONS = {
      desktop: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="8.5" rx="1.2" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 14h5M8 11v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
      mobile: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="4.5" y="1.5" width="7" height="13" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M7 12.3h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
      tablet: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="1.5" width="11" height="13" rx="1.4" stroke="currentColor" stroke-width="1.3"/><path d="M7 12.3h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
    };

    let range = 30; // days; 0 = all time

    /* ---- real, all-visitor numbers from the backend database ---- */
    const EMPTY_SUMMARY = {
      remote: true, totalViews: 0, totalSessions: 0, totalLeads: 0, bounceRate: 0, avgPagesPerSession: 0,
      byPage: [], byRef: [], byDevice: [], byBrowser: [], series: [], live: [], liveCount: 0, recent: [], hasAnyData: false
    };
    async function getSummary(rangeDays) {
      const remote = await API.getRemoteAnalyticsSummary(rangeDays);
      if (!remote) { setAnalyticsSourceBadge('error'); return EMPTY_SUMMARY; }
      setAnalyticsSourceBadge('remote');
      // The API sends days as YYYY-MM-DD; the chart wants a Date at local noon.
      remote.series = (remote.series || []).map((d) => ({ label: new Date(d.date + 'T12:00:00'), count: d.count }));
      return remote;
    }

    function setAnalyticsSourceBadge(state) {
      const badge = document.getElementById('analyticsSourceBadge');
      const note = document.getElementById('analyticsScopeNote');
      if (!badge) return;
      badge.classList.remove('is-remote', 'is-error');
      if (state === 'remote') {
        badge.textContent = 'All visitors (live)';
        badge.classList.add('is-remote');
        if (note) note.textContent = 'Counts every visitor to the live site, from any device. Days are in UTC.';
      } else {
        badge.textContent = 'Connection error';
        badge.classList.add('is-error');
        if (note) note.textContent = 'The analytics request failed — numbers below may be empty until the connection is back.';
      }
    }
    function timeAgo(ts) {
      const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
      if (s < 60) return s + 's ago';
      const m = Math.round(s / 60);
      if (m < 60) return m + 'm ago';
      const h = Math.round(m / 60);
      if (h < 24) return h + 'h ago';
      const d = Math.round(h / 24);
      return d + 'd ago';
    }

    /* ---------------- Live now ---------------- */
    async function renderLive() {
      const s = (await API.getLiveVisitors()) || { liveCount: 0, live: [] };
      const countEl = document.getElementById('liveVisitorCount');
      const listEl = document.getElementById('liveVisitorList');
      const badge = document.getElementById('navLiveBadge');

      countEl.textContent = s.liveCount;
      if (badge) {
        badge.hidden = s.liveCount === 0;
        badge.textContent = s.liveCount;
      }
      document.querySelector('.live-pulse-wrap').classList.toggle('is-live', s.liveCount > 0);

      if (!s.live.length) {
        listEl.innerHTML = `<p class="live-empty">No one is currently browsing the site. Open it in another tab to see this update.</p>`;
        return;
      }
      listEl.innerHTML = s.live.map(v => `
        <div class="live-visitor-row">
          <span class="live-visitor-dot"></span>
          <span class="live-visitor-icon">${DEVICE_ICONS[v.device] || DEVICE_ICONS.desktop}</span>
          <span class="live-visitor-page">${esc(PAGE_LABELS[v.page] || v.page)}</span>
          <span class="live-visitor-time">${esc(timeAgo(v.last))}</span>
        </div>`).join('');
    }

    /* ---------------- KPIs + charts ---------------- */
    function barList(container, emptyEl, rows, labelMap) {
      if (!rows.length) { container.innerHTML = ''; emptyEl.hidden = false; return; }
      emptyEl.hidden = true;
      const max = rows[0].count || 1;
      container.innerHTML = rows.slice(0, 8).map(r => `
        <div class="analytics-bar-row">
          <span class="analytics-bar-label">${esc((labelMap && labelMap[r.key]) || r.key)}</span>
          <span class="analytics-bar-track"><span class="analytics-bar-fill" style="width:${Math.max(4, Math.round(r.count / max * 100))}%"></span></span>
          <span class="analytics-bar-count">${r.count}</span>
        </div>`).join('');
    }

    function renderSeries(series, rangeDays) {
      const chart = document.getElementById('analyticsBarChart');
      const empty = document.getElementById('analyticsSeriesEmpty');
      const sub = document.getElementById('analyticsSeriesSub');
      const total = series.reduce((s, d) => s + d.count, 0);

      sub.textContent = rangeDays
        ? `Page views per day, last ${rangeDays} days.`
        : 'Page views per day, last 30 days shown.';

      if (!total) { chart.innerHTML = ''; empty.hidden = false; return; }
      empty.hidden = true;

      const max = Math.max(1, ...series.map(d => d.count));
      const showEvery = series.length > 45 ? 7 : series.length > 20 ? 3 : 1;

      chart.innerHTML = series.map((d, i) => {
        const dt = new Date(d.label);
        const h = Math.max(d.count > 0 ? 6 : 2, Math.round((d.count / max) * 100));
        const dayLabel = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `<div class="analytics-bar-col" title="${esc(dayLabel)}: ${d.count} view${d.count === 1 ? '' : 's'}">
          <div class="analytics-bar-stick" style="height:${h}%"></div>
          ${i % showEvery === 0 ? `<span class="analytics-bar-daylabel">${esc(dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>` : ''}
        </div>`;
      }).join('');
    }

    function renderFeed(recent) {
      const feed = document.getElementById('analyticsFeed');
      const empty = document.getElementById('analyticsFeedEmpty');
      if (!recent.length) { feed.innerHTML = ''; empty.hidden = false; return; }
      empty.hidden = true;
      feed.innerHTML = recent.map(e => {
        if (e.evt === 'lead') {
          return `<div class="activity-row is-lead">
            <span class="activity-icon">✉</span>
            <span class="activity-text"><strong>New lead</strong> — contact form submitted on ${esc(PAGE_LABELS[e.page] || e.page || 'site')}</span>
            <span class="activity-time">${esc(timeAgo(e.ts))}</span>
          </div>`;
        }
        return `<div class="activity-row">
          <span class="activity-icon">→</span>
          <span class="activity-text">Page view — <strong>${esc(PAGE_LABELS[e.page] || e.page)}</strong>${e.ref && e.ref !== 'Internal' ? ` <span class="activity-muted">via ${esc(e.ref)}</span>` : ''}</span>
          <span class="activity-time">${esc(timeAgo(e.ts))}</span>
        </div>`;
      }).join('');
    }

    async function renderAll() {
      const s = await getSummary(range || null);

      document.getElementById('kpiViews').textContent = s.totalViews;
      document.getElementById('kpiSessions').textContent = s.totalSessions;
      document.getElementById('kpiPagesPerSession').textContent = s.avgPagesPerSession;
      document.getElementById('kpiBounce').textContent = s.bounceRate + '%';
      document.getElementById('kpiLeads').textContent = s.totalLeads;

      renderSeries(s.series, range || null);
      barList(document.getElementById('analyticsTopPages'), document.getElementById('analyticsPagesEmpty'), s.byPage, PAGE_LABELS);
      barList(document.getElementById('analyticsSources'), document.getElementById('analyticsSourcesEmpty'), s.byRef);
      barList(document.getElementById('analyticsDevices'), document.getElementById('analyticsDevicesEmpty'), s.byDevice, { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' });
      barList(document.getElementById('analyticsBrowsers'), document.getElementById('analyticsBrowsersEmpty'), s.byBrowser);
      renderFeed(s.recent);
      renderLive();
    }

    /* ---------------- Range pills ---------------- */
    document.querySelectorAll('#analyticsRangePills .range-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        range = parseInt(btn.dataset.range, 10) || 0;
        document.querySelectorAll('#analyticsRangePills .range-pill').forEach(b => b.classList.toggle('is-active', b === btn));
        renderAll();
      });
    });

    document.getElementById('btnAnalyticsRefresh').addEventListener('click', () => {
      renderAll();
      toast('Analytics refreshed');
    });

    document.getElementById('btnClearAnalytics').addEventListener('click', async () => {
      if (!confirm('Clear ALL recorded analytics data (every visitor\'s page views and live sessions)? This cannot be undone.')) return;
      if (await API.clearRemoteAnalytics()) {
        renderAll();
        toast('Analytics data cleared');
        pulseSaveDot();
      } else toast('Could not clear analytics data');
    });

    /* ---------------- Live polling ---------------- */
    // Live-visitor count and the recent-activity feed update on their own so
    // the page feels real-time even if the admin never touches anything.
    API.poll(() => { if (!root.hidden) renderLive(); }, 10000);
    sectionHooks.analytics = renderAll;

    renderAll();
  }


  /* =================================================================
     SEO SECTION
     ================================================================= */
  function initSeoSection() {
    const pillsEl = document.getElementById('seoPagePills');
    if (!pillsEl) return;

    const PAGES = CMS.SEO_PAGES;
    let activeKey = PAGES[0].key;

    /* ---- read / write the stored SEO object safely ---- */
    function getSeo() {
      const stored = CMS.get(CMS.KEYS.seo, CMS.DEFAULTS.seo) || {};
      const out = {
        global: Object.assign({}, CMS.DEFAULTS.seo.global, stored.global || {}),
        pages: {}
      };
      PAGES.forEach(pg => {
        out.pages[pg.key] = Object.assign(
          {},
          (CMS.DEFAULTS.seo.pages || {})[pg.key] || {},
          (stored.pages || {})[pg.key] || {}
        );
      });
      return out;
    }
    function saveSeo(seo, msg) {
      CMS.set(CMS.KEYS.seo, seo);
      if (msg) toast(msg);
      pulseSaveDot();
      refreshAudit();
      refreshGenerated();
    }

    /* =============== TAG CHIP INPUTS =============== */
    function makeTagInput(chipsId, inputId, onChange) {
      const chipsEl = document.getElementById(chipsId);
      const inputEl = document.getElementById(inputId);
      let tags = [];

      function paint() {
        chipsEl.innerHTML = tags.map((t, i) =>
          `<button type="button" class="tag-chip" data-idx="${i}" title="Click to remove">${esc(t)}<span class="tag-chip-x">×</span></button>`
        ).join('');
        chipsEl.querySelectorAll('.tag-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            tags.splice(parseInt(btn.dataset.idx, 10), 1);
            paint();
            if (onChange) onChange(tags.slice());
          });
        });
      }

      function add(raw) {
        String(raw).split(',').forEach(part => {
          const t = part.trim().replace(/\s+/g, ' ');
          if (!t) return;
          if (t.length > 50) return;
          if (tags.some(x => x.toLowerCase() === t.toLowerCase())) return;
          if (tags.length >= 15) return;
          tags.push(t);
        });
        paint();
        if (onChange) onChange(tags.slice());
      }

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          add(inputEl.value);
          inputEl.value = '';
        } else if (e.key === 'Backspace' && inputEl.value === '' && tags.length) {
          tags.pop();
          paint();
          if (onChange) onChange(tags.slice());
        }
      });
      inputEl.addEventListener('blur', () => {
        if (inputEl.value.trim()) { add(inputEl.value); inputEl.value = ''; }
      });

      return {
        set(next) { tags = (Array.isArray(next) ? next.slice() : []); paint(); },
        get() { return tags.slice(); },
        add: add
      };
    }

    const pageTags = makeTagInput('seoTagChips', 'seoTagInput', () => updatePreview());
    const globalTags = makeTagInput('seoGlobalTagChips', 'seoGlobalTagInput', null);

    /* ---- suggested tags, built from the site's own content ---- */
    function renderTagSuggestions() {
      const wrap = document.getElementById('seoTagSuggestions');
      if (!wrap) return;
      const services = CMS.get(CMS.KEYS.services, CMS.DEFAULTS.services) || [];
      const websites = CMS.get(CMS.KEYS.websites, CMS.DEFAULTS.websites) || [];
      const g = getSeo().global;

      let pool = [];
      if (activeKey === 'services') pool = services.map(s => s.title);
      else if (activeKey === 'websites') pool = Object.values(CMS.WEBSITE_CATEGORIES).map(c => c.toLowerCase() + ' website');
      else if (activeKey === 'about') pool = ['about ' + (g.brandName || ''), (g.jobTitle || ''), 'developer experience'];
      else if (activeKey === 'contact') pool = ['hire ' + (g.brandName || ''), 'web developer contact', 'request a quote'];
      else if (activeKey === 'portfolio') pool = ['web development portfolio', 'client projects', 'case studies'];
      else pool = [(g.jobTitle || ''), 'hire a web developer', (g.addressLocality ? 'web developer in ' + g.addressLocality : 'freelance web developer')];

      pool = pool.concat(String(g.knowsAbout || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4));
      pool = pool.map(s => String(s).trim().toLowerCase()).filter(Boolean);
      pool = pool.filter((s, i) => pool.indexOf(s) === i).slice(0, 8);

      const current = pageTags.get().map(t => t.toLowerCase());
      const available = pool.filter(s => current.indexOf(s) === -1);
      if (!available.length) { wrap.innerHTML = ''; return; }

      wrap.innerHTML = '<span class="tag-suggest-label">Suggested:</span>' +
        available.map(s => `<button type="button" class="tag-suggest" data-tag="${esc(s)}">+ ${esc(s)}</button>`).join('');
      wrap.querySelectorAll('.tag-suggest').forEach(b => {
        b.addEventListener('click', () => { pageTags.add(b.dataset.tag); renderTagSuggestions(); updatePreview(); });
      });
    }

    /* =============== PAGE PILLS =============== */
    function renderPills() {
      const seo = getSeo();
      const visibility = CMS.get(CMS.KEYS.pages, CMS.DEFAULTS.pages) || {};
      pillsEl.innerHTML = PAGES.map(pg => {
        const p = seo.pages[pg.key] || {};
        const t = (p.title || '').trim();
        const d = (p.description || '').trim();
        const good = t.length >= 20 && t.length <= 60 && d.length >= 70 && d.length <= 160 && (p.keywords || []).length >= 2;
        const off = visibility[pg.key] === false;
        return `<button type="button" class="seo-pill ${pg.key === activeKey ? 'is-active' : ''}" data-pagekey="${pg.key}">
          <span class="seo-pill-dot ${good ? 'is-good' : 'is-warn'}"></span>${esc(pg.label)}${off ? '<span class="seo-pill-off">off</span>' : ''}
        </button>`;
      }).join('');
      pillsEl.querySelectorAll('.seo-pill').forEach(b => {
        b.addEventListener('click', () => { activeKey = b.dataset.pagekey; loadPage(); });
      });
    }

    /* =============== LOAD / SAVE A PAGE =============== */
    const elTitle = document.getElementById('seoPageTitle');
    const elDesc = document.getElementById('seoPageDesc');
    const elCanon = document.getElementById('seoPageCanonical');
    const elPriority = document.getElementById('seoPagePriority');
    const elNoindex = document.getElementById('seoPageNoindex');
    const elPagePreview = document.getElementById('previewSeoPageImage');
    let pageImageData = '';

    function loadPage() {
      const seo = getSeo();
      const p = seo.pages[activeKey] || {};
      elTitle.value = p.title || '';
      elDesc.value = p.description || '';
      elCanon.value = p.canonical || '';
      elPriority.value = p.priority || '0.7';
      elNoindex.checked = p.noindex === true;
      pageTags.set(p.keywords || []);
      pageImageData = p.ogImage || '';
      paintImage(elPagePreview, pageImageData, 'No image');
      renderPills();
      renderTagSuggestions();
      updatePreview();
      refreshGenerated();
    }

    function paintImage(el, data, emptyLabel) {
      if (data) {
        el.style.backgroundImage = `url('${data}')`;
        el.textContent = '';
        el.classList.add('has-image');
      } else {
        el.style.backgroundImage = '';
        el.textContent = emptyLabel;
        el.classList.remove('has-image');
      }
    }

    document.getElementById('formSeoPage').addEventListener('submit', (e) => {
      e.preventDefault();
      const seo = getSeo();
      seo.pages[activeKey] = Object.assign({}, seo.pages[activeKey], {
        title: elTitle.value.trim(),
        description: elDesc.value.trim(),
        keywords: pageTags.get(),
        canonical: elCanon.value.trim(),
        priority: elPriority.value,
        noindex: elNoindex.checked,
        ogImage: pageImageData
      });
      saveSeo(seo, 'SEO saved for ' + (PAGES.find(p => p.key === activeKey) || {}).label);
      renderPills();
    });

    document.getElementById('uploadSeoPageImage').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      resizeImageToDataURL(file, 1200, 0.82).then(data => {
        pageImageData = data;
        paintImage(elPagePreview, data, 'No image');
        updatePreview();
        toast('Image ready — press Save Page SEO');
      });
      e.target.value = '';
    });
    document.getElementById('removeSeoPageImage').addEventListener('click', () => {
      pageImageData = '';
      paintImage(elPagePreview, '', 'No image');
      updatePreview();
    });

    /* =============== LIVE PREVIEW + COUNTERS =============== */
    function counter(el, value, min, max) {
      const n = value.length;
      el.textContent = n + ' / ' + max;
      el.classList.remove('is-good', 'is-warn', 'is-bad');
      if (n === 0) el.classList.add('is-warn');
      else if (n < min) el.classList.add('is-warn');
      else if (n > max) el.classList.add('is-bad');
      else el.classList.add('is-good');
    }

    function updatePreview() {
      const seo = getSeo();
      const g = seo.global;
      const title = elTitle.value.trim() || g.defaultTitle || g.brandName || 'Page title';
      const suffix = (g.titleSuffix || '').trim();
      const shown = suffix && title.toLowerCase().indexOf(suffix.replace(/^[\s—\-|]+/, '').toLowerCase()) === -1
        ? title + ' ' + suffix : title;
      const desc = elDesc.value.trim() || g.defaultDescription || 'Your meta description will appear here.';
      const base = (g.siteUrl || 'https://example.com').replace(/\/+$/, '');
      const file = (PAGES.find(p => p.key === activeKey) || {}).file || 'index.html';
      const url = activeKey === 'home' ? base + '/' : base + '/' + file;
      let domain = base.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

      counter(document.getElementById('seoTitleCounter'), elTitle.value.trim(), 20, 60);
      counter(document.getElementById('seoDescCounter'), elDesc.value.trim(), 70, 160);

      document.getElementById('serpTitle').textContent = shown.length > 62 ? shown.slice(0, 61) + '…' : shown;
      document.getElementById('serpDesc').textContent = desc.length > 165 ? desc.slice(0, 164) + '…' : desc;
      document.getElementById('serpUrl').textContent = url;
      document.getElementById('serpBrand').textContent = g.brandName || 'Your Site';
      document.getElementById('serpFavicon').textContent = (g.brandName || 'S').trim().charAt(0).toUpperCase();

      document.getElementById('socialPreviewTitle').textContent = shown;
      document.getElementById('socialPreviewDesc').textContent = desc;
      document.getElementById('socialPreviewDomain').textContent = domain.toUpperCase();

      const img = pageImageData || g.ogImage || '';
      const socialImg = document.getElementById('socialPreviewImg');
      if (img) {
        socialImg.style.backgroundImage = `url('${img}')`;
        socialImg.textContent = '';
        socialImg.classList.add('has-image');
      } else {
        socialImg.style.backgroundImage = '';
        socialImg.textContent = 'No share image set';
        socialImg.classList.remove('has-image');
      }
    }

    elTitle.addEventListener('input', updatePreview);
    elDesc.addEventListener('input', updatePreview);

    /* =============== GLOBAL SETTINGS FORM =============== */
    const elDefaultPreview = document.getElementById('previewSeoDefaultImage');
    let defaultImageData = '';

    function loadGlobal() {
      const g = getSeo().global;
      document.getElementById('seoSiteUrl').value = g.siteUrl || '';
      document.getElementById('seoBrandName').value = g.brandName || '';
      document.getElementById('seoTitleSuffix').value = g.titleSuffix || '';
      document.getElementById('seoDefaultDesc').value = g.defaultDescription || '';
      document.getElementById('seoAuthor').value = g.author || '';
      document.getElementById('seoJobTitle').value = g.jobTitle || '';
      document.getElementById('seoEntityType').value = g.entityType || 'Person';
      document.getElementById('seoTwitter').value = g.twitterHandle || '';
      document.getElementById('seoCity').value = g.addressLocality || '';
      document.getElementById('seoCountry').value = g.addressCountry || '';
      document.getElementById('seoKnowsAbout').value = g.knowsAbout || '';
      document.getElementById('seoLang').value = g.lang || 'en';
      document.getElementById('seoChangefreq').value = g.sitemapChangefreq || 'monthly';
      document.getElementById('seoRobotsIndex').checked = g.robotsIndex !== false;
      document.getElementById('seoStructuredData').checked = g.structuredData !== false;
      document.getElementById('seoGaId').value = g.gaId || '';
      document.getElementById('seoGoogleVerify').value = g.googleVerification || '';
      document.getElementById('seoBingVerify').value = g.bingVerification || '';
      document.getElementById('seoThemeColor').value = g.themeColor || '';
      globalTags.set(g.defaultKeywords || []);
      defaultImageData = g.ogImage || '';
      paintImage(elDefaultPreview, defaultImageData, 'No image');
      counter(document.getElementById('seoDefaultDescCounter'), (g.defaultDescription || '').trim(), 70, 160);
    }

    document.getElementById('seoDefaultDesc').addEventListener('input', (e) => {
      counter(document.getElementById('seoDefaultDescCounter'), e.target.value.trim(), 70, 160);
    });

    document.getElementById('formSeoGlobal').addEventListener('submit', (e) => {
      e.preventDefault();
      const seo = getSeo();
      let url = document.getElementById('seoSiteUrl').value.trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

      seo.global = Object.assign({}, seo.global, {
        siteUrl: url,
        brandName: document.getElementById('seoBrandName').value.trim(),
        titleSuffix: document.getElementById('seoTitleSuffix').value.trim(),
        defaultDescription: document.getElementById('seoDefaultDesc').value.trim(),
        defaultKeywords: globalTags.get(),
        author: document.getElementById('seoAuthor').value.trim(),
        jobTitle: document.getElementById('seoJobTitle').value.trim(),
        entityType: document.getElementById('seoEntityType').value,
        twitterHandle: document.getElementById('seoTwitter').value.trim(),
        addressLocality: document.getElementById('seoCity').value.trim(),
        addressCountry: document.getElementById('seoCountry').value.trim(),
        knowsAbout: document.getElementById('seoKnowsAbout').value.trim(),
        lang: document.getElementById('seoLang').value,
        sitemapChangefreq: document.getElementById('seoChangefreq').value,
        robotsIndex: document.getElementById('seoRobotsIndex').checked,
        structuredData: document.getElementById('seoStructuredData').checked,
        ogImage: defaultImageData
      });
      saveSeo(seo, 'Site-wide SEO settings saved');
      renderPills();
      renderTagSuggestions();
      updatePreview();
    });

    document.getElementById('uploadSeoDefaultImage').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      resizeImageToDataURL(file, 1200, 0.82).then(data => {
        defaultImageData = data;
        paintImage(elDefaultPreview, data, 'No image');
        updatePreview();
        toast('Image ready — press Save Site-Wide SEO');
      });
      e.target.value = '';
    });
    document.getElementById('removeSeoDefaultImage').addEventListener('click', () => {
      defaultImageData = '';
      paintImage(elDefaultPreview, '', 'No image');
      updatePreview();
    });

    /* =============== ANALYTICS FORM =============== */
    document.getElementById('formSeoAnalytics').addEventListener('submit', (e) => {
      e.preventDefault();
      const gaId = document.getElementById('seoGaId').value.trim();
      if (gaId && !/^G-[A-Z0-9]+$/i.test(gaId)) {
        toast('Analytics ID should look like G-XXXXXXXXXX');
        return;
      }
      const seo = getSeo();
      seo.global = Object.assign({}, seo.global, {
        gaId: gaId,
        googleVerification: document.getElementById('seoGoogleVerify').value.trim().replace(/^.*content=["']?([^"'>]+).*$/, '$1'),
        bingVerification: document.getElementById('seoBingVerify').value.trim().replace(/^.*content=["']?([^"'>]+).*$/, '$1'),
        themeColor: document.getElementById('seoThemeColor').value.trim()
      });
      saveSeo(seo, 'Analytics settings saved');
      loadGlobal();
    });

    /* =============== HEALTH SCORE =============== */
    const ringFill = document.getElementById('seoRingFill');
    const RING_LEN = 2 * Math.PI * 52;
    if (ringFill) {
      ringFill.style.strokeDasharray = RING_LEN.toFixed(1);
      ringFill.style.strokeDashoffset = RING_LEN.toFixed(1);
    }

    function refreshAudit() {
      const result = CMS.auditSeo();
      const scoreEl = document.getElementById('seoScoreValue');
      const listEl = document.getElementById('seoCheckList');
      const badge = document.getElementById('navSeoBadge');

      scoreEl.textContent = result.score;
      if (ringFill) {
        ringFill.style.strokeDashoffset = (RING_LEN - (RING_LEN * result.score / 100)).toFixed(1);
        ringFill.setAttribute('data-level', result.score >= 80 ? 'good' : result.score >= 50 ? 'ok' : 'bad');
      }

      const failed = result.checks.filter(c => !c.ok);
      document.getElementById('seoScoreSummary').textContent =
        failed.length === 0
          ? `All ${result.total} checks passed — your SEO setup is in good shape.`
          : `${result.passed} of ${result.total} checks passed. ${failed.length} ${failed.length === 1 ? 'item needs' : 'items need'} attention below.`;

      if (badge) {
        badge.hidden = failed.length === 0;
        badge.textContent = failed.length;
      }

      listEl.innerHTML = result.checks.map(c => `
        <div class="seo-check ${c.ok ? 'is-pass' : 'is-fail'}">
          <span class="seo-check-icon">${c.ok
            ? '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 4.5v4.5M8 11.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'}</span>
          <div class="seo-check-body">
            <span class="seo-check-label">${esc(c.label)}</span>
            ${c.ok ? '' : `<span class="seo-check-hint">${esc(c.hint)}</span>`}
          </div>
        </div>
      `).join('');
    }

    document.getElementById('btnSeoRecheck').addEventListener('click', () => {
      refreshAudit();
      refreshGenerated();
      toast('SEO check re-run');
    });
    document.getElementById('btnSeoFixJump').addEventListener('click', () => {
      const first = document.querySelector('.seo-check.is-fail');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else toast('Nothing to fix — everything passed');
    });

    /* =============== SITEMAP / ROBOTS =============== */
    function refreshGenerated() {
      document.getElementById('seoSitemapOut').textContent = CMS.buildSitemap();
      document.getElementById('seoRobotsOut').textContent = CMS.buildRobotsTxt();
      const snip = document.getElementById('seoHeadSnippet');
      if (snip) {
        snip.textContent = CMS.buildHeadSnippet(activeKey);
        document.getElementById('seoSnippetPageName').textContent =
          (PAGES.find(p => p.key === activeKey) || {}).label || '';
      }
    }

    function copyText(text, label) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(label + ' copied'), () => toast('Copy failed — select it manually'));
      } else {
        toast('Copy not supported — select it manually');
      }
    }
    function downloadText(text, filename, mime) {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(filename + ' downloaded');
    }

    document.getElementById('btnCopySitemap').addEventListener('click', () => copyText(CMS.buildSitemap(), 'sitemap.xml'));
    document.getElementById('btnCopyRobots').addEventListener('click', () => copyText(CMS.buildRobotsTxt(), 'robots.txt'));
    document.getElementById('btnDownloadSitemap').addEventListener('click', () => downloadText(CMS.buildSitemap(), 'sitemap.xml', 'application/xml'));
    document.getElementById('btnDownloadRobots').addEventListener('click', () => downloadText(CMS.buildRobotsTxt(), 'robots.txt', 'text/plain'));
    document.getElementById('btnCopySnippet').addEventListener('click', () => copyText(CMS.buildHeadSnippet(activeKey), 'Meta tags'));
    document.getElementById('btnDownloadSnippet').addEventListener('click', () => {
      const label = (PAGES.find(p => p.key === activeKey) || {}).key || 'page';
      downloadText(CMS.buildHeadSnippet(activeKey), 'meta-tags-' + label + '.txt', 'text/plain');
    });

    /* ---- first paint ---- */
    loadGlobal();
    loadPage();
    refreshAudit();
    refreshGenerated();
  }


  /* =================================================================
     SETTINGS SECTION
     ================================================================= */
  async function renderBackendStatus() {
    const dot = document.getElementById('backendStatusDot');
    const text = document.getElementById('backendStatusText');
    const hint = document.getElementById('backendStatusHint');
    if (!dot) return;
    function paint(state, label, hintText) {
      dot.classList.remove('is-connected', 'is-error', 'is-off');
      dot.classList.add(state);
      text.textContent = label;
      hint.textContent = hintText;
    }
    const info = await API.getSystemInfo();
    if (!info) {
      paint('is-error', 'Cannot reach the backend', 'The API did not respond. Edits cannot be saved until the connection is back.');
      return;
    }
    const mins = Math.floor(info.uptimeSec / 60);
    const up = mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min';
    paint(info.database.ok ? 'is-connected' : 'is-error',
      info.database.ok ? 'Connected — ' + info.database.client + ' database' : 'API is up but the database is not responding',
      `Environment: ${info.environment} · Node ${info.node} · API uptime ${up} · Signed in as ${currentUser ? currentUser.username : '—'}. All changes are stored in the database.`);
  }

  function initSettingsSection() {
    renderBackendStatus();
    sectionHooks.settings = renderBackendStatus;

    /* ---- Backup: export everything to a JSON file, or restore from one ---- */
    // Messages, testimonials, media files and analytics live in their own
    // tables and are not part of this content backup.
    const BACKUP_KEYS = ['theme', 'content', 'services', 'awards', 'portfolio', 'milestones',
      'skills', 'contactInfo', 'images', 'pages', 'websites', 'seo'];
    const exportBtn = document.getElementById('btnExportContent');
    const importInput = document.getElementById('importContentFile');
    const exportImportMsg = document.getElementById('exportImportMsg');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const payload = { exportedAt: new Date().toISOString(), source: 'Sohastics CMS backup', keys: {} };
        BACKUP_KEYS.forEach((k) => { payload.keys[k] = CMS.get(CMS.KEYS[k], CMS.DEFAULTS[k]); });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sohastics-content-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        exportImportMsg.style.color = 'var(--blue-soft)';
        exportImportMsg.textContent = 'Backup downloaded. Keep this file somewhere safe.';
        toast('Backup downloaded');
      });
    }

    if (importInput) {
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          let parsed;
          try { parsed = JSON.parse(reader.result); }
          catch (err) {
            exportImportMsg.style.color = 'var(--orange-soft)';
            exportImportMsg.textContent = 'That file isn\'t valid JSON — could not restore.';
            return;
          }
          const keys = parsed && parsed.keys;
          if (!keys || typeof keys !== 'object') {
            exportImportMsg.style.color = 'var(--orange-soft)';
            exportImportMsg.textContent = 'That doesn\'t look like a backup file from this site.';
            return;
          }
          if (!confirm('Restore content from this backup? This overwrites the content currently saved in the database. Continue?')) return;
          const toRestore = BACKUP_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(keys, k));
          const results = await Promise.all(toRestore.map((k) => API.pushContent(k, keys[k])));
          const failed = results.filter((r) => !r.ok);
          if (failed.length) {
            exportImportMsg.style.color = 'var(--orange-soft)';
            exportImportMsg.textContent = `Restored ${results.length - failed.length} of ${results.length} sections. Failed: ${failed.map((f) => f.key).join(', ')} (${failed[0].error || 'rejected by the server'}).`;
            return;
          }
          exportImportMsg.style.color = 'var(--blue-soft)';
          exportImportMsg.textContent = `Restored ${results.length} section(s) from the backup.`;
          toast('Content restored from backup');
          setTimeout(() => window.location.reload(), 900);
        };
        reader.readAsText(file);
        importInput.value = '';
      });
    }
  }

  // Runs last, after every const/let/function above has been declared:
  // a returning admin whose session cookie is still valid lands straight
  // on the dashboard.
  (async function bootAdmin() {
    if (window.location.hash === '#expired') {
      showLoginError('Your session ended. Please sign in again.');
      history.replaceState(null, '', window.location.pathname);
    }
    const user = await API.getSession();
    if (user) showDashboard(user);
  })();

})();
