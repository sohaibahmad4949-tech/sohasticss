// =====================================================================
// AHMED — PORTFOLIO SITE SCRIPTS
// Shared across all pages. Interactive behavior (reveal animation,
// counters, filters, lightbox, skill meters) is wrapped in named
// init functions so it can be re-run whenever the CMS re-renders
// content — either on first load or live, when the admin panel
// saves a change in another tab on the same browser.
// =====================================================================

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Scroll reveal ---------------- */
function initRevealObservers() {
  const revealItems = document.querySelectorAll('.reveal-item');

  ['.stats-grid', '.services-grid', '.work-grid', '.portfolio-grid', '.pricing-grid', '.websites-grid', '.websites-shop-grid'].forEach(sel => {
    document.querySelectorAll(sel).forEach(group => {
      Array.from(group.children).forEach((child, i) => {
        child.style.setProperty('--i', i);
      });
    });
  });

  if (prefersReducedMotion) {
    revealItems.forEach(el => el.classList.add('is-visible'));
    return;
  }
  if (!('IntersectionObserver' in window)) {
    revealItems.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  revealItems.forEach(el => revealObserver.observe(el));
}

/* ---------------- Animated stat counters ---------------- */
function initCounters() {
  const statNumbers = document.querySelectorAll('.stat-number');
  if (!statNumbers.length) return;

  const animateCount = (el) => {
    const target = parseFloat(el.dataset.countTo);
    const decimals = parseInt(el.dataset.decimal || '0', 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1600;
    const start = performance.now();

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals) + suffix;
    };

    if (prefersReducedMotion) el.textContent = target.toFixed(decimals) + suffix;
    else requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          statObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statNumbers.forEach(el => statObserver.observe(el));
  } else {
    statNumbers.forEach(animateCount);
  }
}

/* ---------------- Skill meters (About page) ---------------- */
function initSkillMeters() {
  const skillsList = document.getElementById('skillsList');
  if (!skillsList) return;
  const meters = Array.from(skillsList.querySelectorAll('.skill-meter'));

  const animateSkill = (meter) => {
    const target = parseInt(meter.dataset.skillValue, 10) || 0;
    const fill = meter.querySelector('.skill-fill');
    const numEl = meter.querySelector('.skill-percent-num');
    if (prefersReducedMotion) {
      fill.style.width = target + '%';
      numEl.textContent = target;
      return;
    }
    fill.style.width = target + '%';
    const duration = 1300;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      numEl.textContent = Math.round(target * eased);
      if (progress < 1) requestAnimationFrame(step);
      else numEl.textContent = target;
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    const skillObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateSkill(entry.target);
          skillObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    meters.forEach(m => skillObserver.observe(m));
  } else {
    meters.forEach(animateSkill);
  }
}

/* ---------------- Portfolio filter tabs ---------------- */
function initPortfolioFilters() {
  const filterTabs = document.getElementById('filterTabs');
  const portfolioGrid = document.getElementById('portfolioGrid');
  if (!filterTabs || !portfolioGrid) return;

  const tabs = Array.from(filterTabs.querySelectorAll('.filter-tab'));
  const pill = document.getElementById('filterPill');
  const emptyState = document.getElementById('gridEmptyState');

  function movePill(tab) {
    if (!pill || !tab) return;
    pill.style.width = tab.offsetWidth + 'px';
    pill.style.transform = `translateX(${tab.offsetLeft - 8}px)`;
  }

  function setFilter(tab) {
    tabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    movePill(tab);

    const cards = Array.from(portfolioGrid.querySelectorAll('.project-card'));
    const filter = tab.dataset.filter;
    const matching = cards.filter(c => filter === 'all' || c.dataset.category === filter);
    const nonMatching = cards.filter(c => !(filter === 'all' || c.dataset.category === filter));

    nonMatching.forEach(c => c.classList.add('is-hiding'));

    const settle = () => {
      nonMatching.forEach(c => { c.style.display = 'none'; });
      matching.forEach((c, i) => {
        c.style.display = '';
        c.classList.remove('is-hiding');
        c.classList.remove('is-visible');
        void c.offsetWidth;
        setTimeout(() => c.classList.add('is-visible'), i * 60);
      });
      if (emptyState) emptyState.hidden = matching.length !== 0;
    };

    if (prefersReducedMotion) settle();
    else setTimeout(settle, nonMatching.length ? 260 : 0);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => setFilter(tab));
  });

  const activeTab = filterTabs.querySelector('.filter-tab.is-active') || tabs[0];
  requestAnimationFrame(() => movePill(activeTab));
  window.addEventListener('resize', () => movePill(filterTabs.querySelector('.filter-tab.is-active')));
}

/* ---------------- Shared: play a project / website video inside a lightbox ---------------- */
function mountLightboxVideo(media, videoValue) {
  unmountLightboxVideo(media);
  const embed = videoValue && window.AhmedCMS ? window.AhmedCMS.videoEmbedSrc(videoValue) : null;
  if (!embed) return false;
  media.classList.add('has-video');
  if (embed.type === 'iframe') {
    const iframe = document.createElement('iframe');
    iframe.className = 'lb-video';
    iframe.src = embed.src;
    iframe.title = 'Video preview';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    iframe.setAttribute('allowfullscreen', '');
    media.appendChild(iframe);
  } else {
    const video = document.createElement('video');
    video.className = 'lb-video';
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    media.appendChild(video);
    window.AhmedCMS.resolveVideoUrl(embed.src).then(src => {
      if (src) video.src = src;
      else media.removeChild(video), media.classList.remove('has-video');
    });
  }
  return true;
}

function unmountLightboxVideo(media) {
  media.querySelectorAll('.lb-video').forEach(el => {
    if (el.tagName === 'VIDEO') { el.pause(); el.removeAttribute('src'); el.load(); }
    el.remove();
  });
  media.classList.remove('has-video');
}

/* ---------------- Lightbox ---------------- */
function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  const portfolioGrid = document.getElementById('portfolioGrid');
  if (!lightbox || !portfolioGrid) return;

  const backdrop = document.getElementById('lightboxBackdrop');
  const closeBtn = document.getElementById('lightboxClose');
  const media = document.getElementById('lightboxMedia');
  const titleEl = document.getElementById('lightboxTitle');
  const descEl = document.getElementById('lightboxDesc');
  const tagEl = document.getElementById('lightboxTag');
  const tcEl = document.getElementById('lightboxTc');
  let lastFocused = null;

  function openLightbox(card) {
    lastFocused = document.activeElement;
    titleEl.textContent = card.dataset.title || '';
    descEl.textContent = card.dataset.desc || '';
    tcEl.textContent = card.dataset.tc || '';
    const tag = card.dataset.tag || '';
    tagEl.innerHTML = `<span class="eyebrow-dot"></span>${tag}`;
    const tone = getComputedStyle(card).getPropertyValue('--tone').trim();
    if (tone) media.style.setProperty('--tone', tone);
    const bg = card.querySelector('.project-thumb').style.backgroundImage;
    media.style.backgroundImage = bg || '';
    media.style.backgroundSize = 'cover';
    media.style.backgroundPosition = 'center';
    mountLightboxVideo(media, card.dataset.video || '');

    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    requestAnimationFrame(() => lightbox.classList.add('is-open'));
    closeBtn.focus();
  }

  function closeLightbox() {
    unmountLightboxVideo(media);
    lightbox.classList.remove('is-open');
    document.body.classList.remove('lightbox-open');
    setTimeout(() => { lightbox.hidden = true; }, 400);
    if (lastFocused) lastFocused.focus();
  }

  portfolioGrid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => openLightbox(card));
  });
  closeBtn.onclick = closeLightbox;
  backdrop.onclick = closeLightbox;
  document.onkeydown = (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  };
}

/* ---------------- Websites-for-sale filter tabs ---------------- */
function initWebsitesFilters() {
  const filterTabs = document.getElementById('websitesFilterTabs');
  const grid = document.getElementById('websitesGrid');
  if (!filterTabs || !grid) return;

  const tabs = Array.from(filterTabs.querySelectorAll('.filter-tab'));
  if (!tabs.length) return;
  const pill = document.getElementById('websitesFilterPill');
  const emptyState = document.getElementById('websitesGridEmpty');

  function movePill(tab) {
    if (!pill || !tab) return;
    pill.style.width = tab.offsetWidth + 'px';
    pill.style.transform = `translateX(${tab.offsetLeft - 8}px)`;
  }

  function setFilter(tab) {
    tabs.forEach(t => { t.classList.remove('is-active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
    movePill(tab);

    const cards = Array.from(grid.querySelectorAll('.website-shop-card'));
    const filter = tab.dataset.filter;
    const matching = cards.filter(c => filter === 'all' || c.dataset.category === filter);
    const nonMatching = cards.filter(c => !(filter === 'all' || c.dataset.category === filter));

    nonMatching.forEach(c => c.classList.add('is-hiding'));

    const settle = () => {
      nonMatching.forEach(c => { c.style.display = 'none'; });
      matching.forEach((c, i) => {
        c.style.display = '';
        c.classList.remove('is-hiding');
        c.classList.remove('is-visible');
        void c.offsetWidth;
        setTimeout(() => c.classList.add('is-visible'), i * 60);
      });
      if (emptyState) emptyState.hidden = matching.length !== 0;
    };

    if (prefersReducedMotion) settle();
    else setTimeout(settle, nonMatching.length ? 260 : 0);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => setFilter(tab));
  });

  const activeTab = filterTabs.querySelector('.filter-tab.is-active') || tabs[0];
  requestAnimationFrame(() => movePill(activeTab));
  window.addEventListener('resize', () => movePill(filterTabs.querySelector('.filter-tab.is-active')));
}

/* ---------------- Websites-for-sale preview lightbox ---------------- */
function initWebsitesLightbox() {
  const lightbox = document.getElementById('websiteLightbox');
  const grid = document.getElementById('websitesGrid');
  if (!lightbox || !grid) return;

  const backdrop = document.getElementById('websiteLightboxBackdrop');
  const closeBtn = document.getElementById('websiteLightboxClose');
  const media = document.getElementById('websiteLightboxMedia');
  const titleEl = document.getElementById('websiteLightboxTitle');
  const descEl = document.getElementById('websiteLightboxDesc');
  const tagEl = document.getElementById('websiteLightboxTag');
  const priceEl = document.getElementById('websiteLightboxPrice');
  let lastFocused = null;

  function openLightbox(card) {
    lastFocused = document.activeElement;
    titleEl.textContent = card.dataset.title || '';
    descEl.textContent = card.dataset.desc || '';
    priceEl.textContent = '$' + (card.dataset.price || '0');
    const tag = card.dataset.categoryLabel || '';
    tagEl.innerHTML = `<span class="eyebrow-dot"></span>${tag}`;

    // Rebuild media area each time: either an embedded video preview,
    // or a static thumbnail fallback matching the card's own image.
    media.innerHTML = '<div class="frame-corner tl"></div><div class="frame-corner tr"></div><div class="frame-corner bl"></div><div class="frame-corner br"></div>';
    const hasVideo = mountLightboxVideo(media, card.dataset.video || '');
    if (hasVideo) {
      media.style.backgroundImage = '';
    } else {
      const bg = card.querySelector('.website-shop-thumb').style.backgroundImage;
      media.style.backgroundImage = bg || '';
      media.style.backgroundSize = 'cover';
      media.style.backgroundPosition = 'center';
    }

    lightbox.hidden = false;
    document.body.classList.add('lightbox-open');
    requestAnimationFrame(() => lightbox.classList.add('is-open'));
    closeBtn.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.body.classList.remove('lightbox-open');
    unmountLightboxVideo(media);
    setTimeout(() => {
      lightbox.hidden = true;
      media.innerHTML = '<div class="frame-corner tl"></div><div class="frame-corner tr"></div><div class="frame-corner bl"></div><div class="frame-corner br"></div>';
      media.style.backgroundImage = '';
    }, 400);
    if (lastFocused) lastFocused.focus();
  }

  grid.querySelectorAll('.website-shop-card').forEach(card => {
    card.addEventListener('click', () => openLightbox(card));
  });
  closeBtn.onclick = closeLightbox;
  backdrop.onclick = closeLightbox;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
}

/* ---------------- Bundle: everything that depends on CMS-rendered DOM ---------------- */
function initAllCmsInteractive() {
  initRevealObservers();
  initCounters();
  initSkillMeters();
  initPortfolioFilters();
  initLightbox();
  initWebsitesFilters();
  initWebsitesLightbox();
}

document.addEventListener('DOMContentLoaded', () => {

  /* ---------------- Mobile nav toggle ---------------- */
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('nav-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        mainNav.style.display = 'flex';
        mainNav.style.position = 'absolute';
        mainNav.style.top = '100%';
        mainNav.style.left = '0';
        mainNav.style.right = '0';
        mainNav.style.flexDirection = 'column';
        mainNav.style.background = 'rgba(14,12,10,0.98)';
        mainNav.style.padding = '20px 32px';
        mainNav.style.borderBottom = '1px solid rgba(243,236,226,0.09)';
        mainNav.style.gap = '18px';
      } else {
        mainNav.style.display = 'none';
      }
    });
  }

  initAllCmsInteractive();

  // Live sync: whenever the CMS loader re-renders content (either the
  // initial load, or a live update pushed from the admin panel in
  // another tab), re-initialize everything that depends on that DOM.
  window.addEventListener('cms:rendered', initAllCmsInteractive);

  /* ---------------- Testimonial slider ---------------- */
  const testiTrack = document.getElementById('testiTrack');
  if (testiTrack) {
    const dotsWrap = document.getElementById('testiDots');
    const prevBtn = document.getElementById('testiPrev');
    const nextBtn = document.getElementById('testiNext');
    let current = 0;
    let autoTimer = null;
    let cards = [];
    let dots = [];

    function render() {
      cards.forEach((c, i) => c.classList.toggle('is-active', i === current));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === current));
    }

    function goTo(index, userInitiated) {
      if (!cards.length) return;
      current = (index + cards.length) % cards.length;
      render();
      if (userInitiated) restartAuto();
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    function restartAuto() {
      if (autoTimer) clearInterval(autoTimer);
      if (!prefersReducedMotion && cards.length > 1) {
        autoTimer = setInterval(next, 5500);
      }
    }

    const controlsWrap = testiTrack.closest('.testi-wrap')?.querySelector('.testi-controls');

    function setupTestimonialSlider() {
      cards = Array.from(testiTrack.querySelectorAll('.testi-card'));
      const emptyNotice = document.getElementById('testiEmptyNotice');

      if (cards.length === 0) {
        if (!emptyNotice) {
          const notice = document.createElement('div');
          notice.id = 'testiEmptyNotice';
          notice.className = 'testi-empty';
          notice.innerHTML = '<p>No reviews published yet. Be the first to write a review!</p>';
          testiTrack.appendChild(notice);
        }
        if (controlsWrap) controlsWrap.style.display = 'none';
        if (dotsWrap) dotsWrap.innerHTML = '';
        dots = [];
        return;
      }

      if (emptyNotice) emptyNotice.remove();
      if (controlsWrap) controlsWrap.style.display = cards.length > 1 ? 'flex' : 'none';

      if (dotsWrap) dotsWrap.innerHTML = '';
      dots = [];
      cards.forEach((_, i) => {
        if (!dotsWrap) return;
        const dot = document.createElement('button');
        dot.className = 'testi-dot';
        dot.type = 'button';
        dot.setAttribute('aria-label', `Show testimonial ${i + 1}`);
        dot.addEventListener('click', () => goTo(i, true));
        dotsWrap.appendChild(dot);
      });
      dots = dotsWrap ? Array.from(dotsWrap.children) : [];
      current = Math.min(current, Math.max(cards.length - 1, 0));
      render();
      restartAuto();
    }

    if (nextBtn) nextBtn.addEventListener('click', () => goTo(current + 1, true));
    if (prevBtn) prevBtn.addEventListener('click', () => goTo(current - 1, true));

    setupTestimonialSlider();

    // Reviews arrive from the backend after this script has run, so rebuild
    // the slider every time the CMS finishes rendering (this is what makes
    // approved reviews appear instead of "No reviews published yet").
    window.addEventListener('cms:rendered', setupTestimonialSlider);

    // A review getting approved/unpublished/deleted in another tab
    // (or this one) re-renders the CMS content, which changes how
    // many .testi-card elements exist — rebuild the slider to match.
    window.addEventListener('storage', (e) => {
      if (e.key === 'ahmedCMS_reviews') setupTestimonialSlider();
    });
  }

  /* ---------------- Write a Review modal (Home page) ---------------- */
  const reviewModal = document.getElementById('reviewModal');
  if (reviewModal) {
    const openBtn = document.getElementById('openReviewModalBtn');
    const closeBtn = document.getElementById('reviewModalClose');
    const backdrop = document.getElementById('reviewModalBackdrop');
    const form = document.getElementById('reviewForm');
    const successEl = document.getElementById('reviewSuccess');
    const doneBtn = document.getElementById('reviewModalDoneBtn');
    const starButtons = Array.from(document.querySelectorAll('.star-btn'));
    const ratingInput = document.getElementById('reviewRatingValue');
    let selectedRating = 0;
    let lastFocused = null;

    function paintStars(value) {
      starButtons.forEach((btn) => {
        const v = parseInt(btn.dataset.value, 10);
        btn.classList.toggle('is-selected', v <= value);
      });
    }

    starButtons.forEach((btn) => {
      const v = parseInt(btn.dataset.value, 10);
      btn.addEventListener('mouseenter', () => paintStars(v));
      btn.addEventListener('mouseleave', () => paintStars(selectedRating));
      btn.addEventListener('click', () => {
        selectedRating = v;
        ratingInput.value = String(v);
        paintStars(v);
      });
    });

    function resetReviewForm() {
      form.reset();
      selectedRating = 0;
      ratingInput.value = '0';
      paintStars(0);
      form.hidden = false;
      successEl.hidden = true;
    }

    function openReviewModal() {
      lastFocused = document.activeElement;
      resetReviewForm();
      reviewModal.hidden = false;
      document.body.classList.add('lightbox-open');
      requestAnimationFrame(() => reviewModal.classList.add('is-open'));
      document.getElementById('reviewName').focus();
    }

    function closeReviewModal() {
      reviewModal.classList.remove('is-open');
      document.body.classList.remove('lightbox-open');
      setTimeout(() => { reviewModal.hidden = true; }, 400);
      if (lastFocused) lastFocused.focus();
    }

    if (openBtn) openBtn.addEventListener('click', openReviewModal);
    if (closeBtn) closeBtn.addEventListener('click', closeReviewModal);
    if (backdrop) backdrop.addEventListener('click', closeReviewModal);
    if (doneBtn) doneBtn.addEventListener('click', closeReviewModal);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !reviewModal.hidden) closeReviewModal();
    });

    const reviewError = document.getElementById('reviewError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (reviewError) reviewError.hidden = true;
      if (selectedRating < 1) {
        alert('Please select a star rating before submitting.');
        return;
      }
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // Reviews are stored by the backend as "pending"; they only appear on
      // the Home page after the owner approves them in the admin panel.
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      let result;
      try {
        result = window.CmsApi
          ? await window.CmsApi.submitReview({
              name: document.getElementById('reviewName').value.trim(),
              rating: selectedRating,
              message: document.getElementById('reviewMessage').value.trim(),
              website: (document.getElementById('reviewWebsite') || {}).value || ''
            })
          : { ok: false, error: 'Reviews can\u2019t be sent right now.' };
      } catch (err) { result = { ok: false, error: 'Could not reach the server.' }; }
      if (submitBtn) submitBtn.disabled = false;

      if (!result || !result.ok) {
        const msg = (result && result.error) || 'Something went wrong. Please try again.';
        if (reviewError) { reviewError.textContent = msg; reviewError.hidden = false; } else { alert(msg); }
        return;
      }
      form.hidden = true;
      successEl.hidden = false;
    });
  }

  /* ---------------- Contact form ---------------- */
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    const formSuccess = document.getElementById('formSuccess');
    const formResetBtn = document.getElementById('formResetBtn');

    const formError = document.getElementById('formError');
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    function showFormError(msg) {
      if (!formError) { alert(msg); return; }
      formError.textContent = msg;
      formError.hidden = false;
    }

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (formError) formError.hidden = true;
      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      // The message goes to the backend, which validates it, stores it in the
      // database and makes it appear in the admin panel's Messages tab. The
      // success screen only appears once the server has confirmed it.
      const payload = {
        name: (document.getElementById('fieldName') || {}).value || '',
        email: (document.getElementById('fieldEmail') || {}).value || '',
        projectType: (document.getElementById('fieldProjectType') || {}).value || '',
        budget: (document.getElementById('fieldBudget') || {}).value || '',
        message: (document.getElementById('fieldMessage') || {}).value || '',
        website: (document.getElementById('fieldWebsite') || {}).value || ''   // honeypot: real visitors leave it empty
      };
      if (!window.CmsApi) {
        showFormError('Messages can\u2019t be sent right now. Please email me directly instead.');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;
      let result;
      try { result = await window.CmsApi.insertMessage(payload); }
      catch (err) { result = { ok: false, error: 'Could not reach the server.' }; }
      if (submitBtn) submitBtn.disabled = false;

      if (!result || !result.ok) {
        showFormError((result && result.error) || 'Something went wrong. Please try again.');
        return;
      }
      if (window.AhmedCMS && window.AhmedCMS.analyticsTrackEvent) {
        try { window.AhmedCMS.analyticsTrackEvent('lead', 'contact-form'); } catch (err) {}
      }
      contactForm.hidden = true;
      formSuccess.hidden = false;
    });

    if (formResetBtn) {
      formResetBtn.addEventListener('click', () => {
        contactForm.reset();
        contactForm.hidden = false;
        formSuccess.hidden = true;
      });
    }
  }

  /* ---------------- Milestone timeline fill (About page) ---------------- */
  const milestoneWrap = document.getElementById('milestoneTimeline');
  const milestoneFill = document.getElementById('milestoneFill');
  if (milestoneWrap && milestoneFill) {
    const updateMilestoneFill = () => {
      const rect = milestoneWrap.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const total = rect.height;
      const visible = Math.min(Math.max(viewportH * 0.75 - rect.top, 0), total);
      const pct = total > 0 ? (visible / total) * 100 : 0;
      milestoneFill.style.height = pct + '%';
    };
    if (prefersReducedMotion) {
      milestoneFill.style.height = '100%';
    } else {
      updateMilestoneFill();
      window.addEventListener('scroll', updateMilestoneFill, { passive: true });
      window.addEventListener('resize', updateMilestoneFill);
      window.addEventListener('cms:rendered', updateMilestoneFill);
    }
  }

  /* ---------------- Awards timeline progress fill ---------------- */
  const timelineWrap = document.getElementById('achievementsTimeline');
  const timelineFill = document.getElementById('timelineFill');
  if (timelineWrap && timelineFill) {
    const updateFill = () => {
      const rect = timelineWrap.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const total = rect.height;
      const visible = Math.min(Math.max(viewportH * 0.75 - rect.top, 0), total);
      const pct = total > 0 ? (visible / total) * 100 : 0;
      timelineFill.style.height = pct + '%';
    };
    if (prefersReducedMotion) {
      timelineFill.style.height = '100%';
    } else {
      updateFill();
      window.addEventListener('scroll', updateFill, { passive: true });
      window.addEventListener('resize', updateFill);
      window.addEventListener('cms:rendered', updateFill);
    }
  }

  /* ---------------- Live clock ---------------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function tickClock() {
    const now = new Date();
    const str = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const liveClock = document.getElementById('liveClock');
    const footerClock = document.getElementById('footerClock');
    if (liveClock) liveClock.textContent = str;
    if (footerClock) footerClock.textContent = `LOCAL TIME ${str}`;
  }
  if (!prefersReducedMotion) {
    tickClock();
    setInterval(tickClock, 1000);
  } else {
    const liveClock = document.getElementById('liveClock');
    if (liveClock) liveClock.textContent = '00:00:00';
  }

  /* ---------------- Header shadow on scroll ---------------- */
  const header = document.getElementById('siteHeader');
  if (header) {
    window.addEventListener('scroll', () => {
      header.style.boxShadow = window.scrollY > 10 ? '0 10px 30px -20px rgba(0,0,0,0.8)' : 'none';
    }, { passive: true });
  }

});
