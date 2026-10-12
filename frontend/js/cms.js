// =====================================================================
// SOHASTICS — SITE CMS ENGINE
// Loaded on every public page (before main.js) and by the admin panel.
//
// Content lives in the backend database. On every page load the engine
// pulls the published content from the API (js/api-client.js), keeps a
// copy in localStorage purely as a read cache (so the page still renders
// if the API is briefly unreachable), and renders it into the existing
// page markup. If nothing has been saved yet, sensible defaults matching
// the original design are used.
//
// Public pages never write content. Only the admin panel (which sets
// window.CMS_ADMIN_MODE = true and holds an authenticated session) saves
// changes, and every save goes to the API / database first.
// =====================================================================

(function () {
  'use strict';

  const NS = 'ahmedCMS_';
  const KEYS = {
    theme: NS + 'theme',
    content: NS + 'content',
    services: NS + 'services',
    awards: NS + 'awards',
    portfolio: NS + 'portfolio',
    milestones: NS + 'milestones',
    skills: NS + 'skills',
    contactInfo: NS + 'contactInfo',
    images: NS + 'images',
    reviews: NS + 'reviews',
    pages: NS + 'pages',
    websites: NS + 'websites',
    seo: NS + 'seo'
  };
  const ADMIN_MODE = window.CMS_ADMIN_MODE === true;
  const KEY_NAMES = {};
  Object.keys(KEYS).forEach((name) => { KEY_NAMES[KEYS[name]] = name; });

  /* ---------------------------------------------------------------
     Websites-for-sale category labels — shared between the public
     pages (filter tabs, tags) and the Admin Panel (select dropdown).
     --------------------------------------------------------------- */
  const WEBSITE_CATEGORIES = {
    business: 'Business',
    ecommerce: 'E-commerce',
    landing: 'Landing Page',
    portfolio: 'Portfolio',
    blog: 'Blog / News',
    custom: 'Custom Build'
  };

  /* ---------------------------------------------------------------
     Icon library — shared between site render + admin forms
     --------------------------------------------------------------- */
  const ICONS = {
    film: '<path d="M8 7 4 12l4 5M16 7l4 5-4 5M14 5l-4 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    phone: '<rect x="3" y="4.5" width="18" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h18" stroke="currentColor" stroke-width="1.6"/><circle cx="6" cy="6.5" r="0.6" fill="currentColor"/><circle cx="8" cy="6.5" r="0.6" fill="currentColor"/>',
    grade: '<path d="M12 3 3 8l9 5 9-5-9-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    calendar: '<rect x="3.5" y="5" width="19" height="17" rx="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 10h19M8 3v4M18 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8.5 15l2 2 4-4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" stroke="currentColor" stroke-width="1.6"/><path d="M7 6H4.5A2.5 2.5 0 0 0 4 11a3 3 0 0 0 3 2M17 6h2.5A2.5 2.5 0 0 1 20 11a3 3 0 0 1-3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 14v3M9 20h6M10.5 17h3v3h-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    star: '<path d="M12 3.5 14.3 9l6 .6-4.5 4 1.4 5.9L12 16.7 6.8 19.5 8.2 13.6 3.7 9.6l6-.6 2.3-5.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    mic: '<rect x="9.5" y="3" width="5" height="10" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    play: '<path d="M9 18h6M10 21h4M8 11a4 4 0 1 1 8 0c0 1.8-1 2.7-1.7 3.6-.5.6-.8 1-.8 1.9H10.5c0-.9-.3-1.3-.8-1.9C9 13.7 8 12.8 8 11Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    compass: '<path d="M12 3v4M12 17v4M4.2 6.2l2.8 2.8M17 15l2.8 2.8M3 12h4M17 12h4M4.2 17.8 7 15M17 9l2.8-2.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="3.4" stroke="currentColor" stroke-width="1.6"/>'
  };
  const PLAY_TRIANGLE = '<path fill-rule="evenodd" clip-rule="evenodd" d="M1 9C1 9 3.8 4 9 4C14.2 4 17 9 17 9C17 9 14.2 14 9 14C3.8 14 1 9 1 9ZM9 11.6C10.4359 11.6 11.6 10.4359 11.6 9C11.6 7.56406 10.4359 6.4 9 6.4C7.56406 6.4 6.4 7.56406 6.4 9C6.4 10.4359 7.56406 11.6 9 11.6Z" fill="currentColor"/>';

  function iconSvg(key, size) {
    size = size || 24;
    const paths = ICONS[key] || ICONS.film;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none">${paths}</svg>`;
  }

  /* ---------------------------------------------------------------
     Defaults — mirror the original hand-built content exactly, so a
     fresh install of the site looks identical until the owner edits it.
     --------------------------------------------------------------- */
  const DEFAULTS = {
    theme: 'charcoal-orange',

    content: {
      global: {
        siteName: 'Sohastics'
      },
      home: {
        heroRoleLeft: 'Web Developer',
        heroRoleRight: 'Software Engineer',
        heroTagline: 'Turning ideas into fast, reliable web experiences.',
        statsVideos: '120', statsClients: '45', statsYears: '5', statsRating: '4.9',
        servicesSectionTitle: 'Every project starts with clean code',
        ctaTitle: 'Got an idea stuck in a notebook?',
        ctaSub: "Let's build it into something people can actually use.",
        showBrands: true
      },
      portfolio: {
        pageTitle: 'Full Portfolio',
        pageSub: 'Every project below is real client work, organised the way I actually build — by project type, not by date.'
      },
      services: {
        pageTitle: 'What I Can Build For You',
        pageSub: 'Straightforward services, straightforward pricing. Every project starts with a quick chat about your goals and requirements.',
        note: 'Final pricing depends on project scope, complexity, and timeline — every quote is confirmed before work begins.'
      },
      awards: {
        pageTitle: 'Recognition Along the Way',
        pageSub: 'A few milestones from five years behind the keyboard — not the goal, but good markers of the work paying off.'
      },
      about: {
        pageTitle: 'Started on Weekends. Never Stopped.',
        paragraphs: [
          { text: "I started coding five years ago as a hobby — teaching myself to build a friend's website on weekends, just to see if I could make it better. I could.", highlight: false },
          { text: "Somewhere along the way I fell in love with the craft itself: solving problems, building clean interfaces, and architecting systems that just work. What started as a favour for a friend turned into a full-time career.", highlight: false },
          { text: "What makes me different is that I don't just write code — I build products that solve real problems and are built to last.", highlight: true },
          { text: "My mission is simple: help businesses turn ideas into fast, reliable, well-built web products that actually grow their audience.", highlight: false }
        ]
      },
      contact: {
        pageTitle: "Let's Start Building",
        pageSub: 'Reach out for web development or ongoing support projects — I read and reply to every message myself.'
      }
    },

    services: [
      { id: 'svc1', icon: 'film', title: 'Website Development', desc: 'Custom-built websites using modern frameworks — fast, responsive, and built to convert visitors into customers.', price: '300', unit: '/project' },
      { id: 'svc2', icon: 'phone', title: 'Web Application Development', desc: 'Full-stack web apps with clean architecture, from database design to a polished front-end interface.', price: '800', unit: '/project' },
      { id: 'svc3', icon: 'grade', title: 'API & Backend Development', desc: 'RESTful APIs, database design, and backend logic that scales cleanly as your product grows.', price: '400', unit: '/project' },
      { id: 'svc4', icon: 'calendar', title: 'Website Maintenance & Support', desc: 'Ongoing updates, bug fixes, performance monitoring, and support so your site never falls behind.', price: '150', unit: '/month' }
    ],

    awards: [
      { id: 'aw1', year: '2024', title: 'Best Developer Award', org: 'Local Tech Meetup', desc: 'Recognized for building the most technically impressive project at a community hackathon.', icon: 'trophy' },
      { id: 'aw2', year: '2023', title: 'Open Source Contributor', org: 'Featured on GitHub', desc: 'Spotlighted for consistent contributions to popular open-source developer tools.', icon: 'star' },
      { id: 'aw3', year: '2022', title: 'Guest Speaker', org: 'University Tech Seminar', desc: 'Invited to speak on breaking into web development — sharing the real path from first line of code to full-time client work.', icon: 'mic' }
    ],

    milestones: [
      { id: 'ms1', year: 'Year 1', title: 'Wrote My First Line of Code', desc: "Taught myself to code as a hobby, tinkering with a friend's website on weekends.", icon: 'play' },
      { id: 'ms2', year: 'Year 2', title: 'First Paid Client', desc: 'Took on my first freelance web project and realised this could be more than a hobby.', icon: 'compass' },
      { id: 'ms3', year: 'Year 3', title: 'Shipped 50+ Projects', desc: 'Hit the 50-project mark and started refining a real development workflow.', icon: 'film' },
      { id: 'ms4', year: 'Year 4', title: 'Started Building Full Products', desc: 'Moved from single pages to complete web applications for long-term clients.', icon: 'calendar' },
      { id: 'ms5', year: 'Year 5', title: '120+ Projects, 45+ Clients', desc: 'Today — 120+ projects shipped, 45+ happy clients, and a 4.9 average rating along the way.', icon: 'star' }
    ],

    skills: [
      { id: 'sk1', name: 'Frontend Development', value: 95 },
      { id: 'sk2', name: 'Backend Development', value: 88 },
      { id: 'sk3', name: 'Database Design', value: 85 },
      { id: 'sk4', name: 'API Integration', value: 90 },
      { id: 'sk5', name: 'UI/UX Implementation', value: 92 }
    ],

    portfolio: [],

    contactInfo: {
      email: 'ahmed.editz@gmail.com',
      whatsapp: '',
      instagram: '#',
      youtube: '#'
    },

    images: {
      homePhoto: null,
      aboutPhoto: null
    },

    submissions: [],
    reviews: [],
    pages: {
      home: true,
      portfolio: true,
      services: true,
      awards: true,
      about: true,
      contact: true,
      websites: true
    },

    websites: [],

    seo: {
      global: {
        siteUrl: '',
        brandName: 'Sohastics',
        titleSuffix: '| Sohastics',
        defaultTitle: 'Sohastics — Web Developer & Software Engineer',
        defaultDescription: 'Sohastics is a web developer and software engineer building fast, reliable websites, web applications and APIs for clients worldwide.',
        defaultKeywords: ['web developer', 'software engineer', 'website development', 'web application development', 'freelance developer'],
        ogImage: '',
        author: 'Sohastics',
        jobTitle: 'Web Developer & Software Engineer',
        entityType: 'Person',
        knowsAbout: 'HTML, CSS, JavaScript, React, Next.js, Tailwind CSS, Node.js, REST APIs',
        addressLocality: '',
        addressCountry: '',
        geoRegion: '',
        currency: 'USD',
        lang: 'en',
        locale: 'en_US',
        themeColor: '#FF5A1F',
        twitterHandle: '',
        gaId: '',
        googleVerification: '',
        bingVerification: '',
        robotsIndex: true,
        structuredData: true,
        sitemapChangefreq: 'monthly'
      },
      pages: {
        home: {
          title: 'Web Developer & Software Engineer',
          description: 'Custom websites, web applications and APIs built by Sohastics — clean code, fast load times, and designs that turn visitors into customers.',
          keywords: ['hire web developer', 'freelance web developer', 'custom website'],
          ogImage: '', canonical: '', noindex: false, priority: '1.0'
        },
        portfolio: {
          title: 'Portfolio — Web Development Projects',
          description: 'Browse real client work by Sohastics: business websites, web applications, landing pages and backend systems, organised by project type.',
          keywords: ['web developer portfolio', 'website projects', 'case studies'],
          ogImage: '', canonical: '', noindex: false, priority: '0.9'
        },
        services: {
          title: 'Web Development Services & Pricing',
          description: 'Website development, web apps, API and backend work, plus ongoing maintenance — straightforward services with transparent starting prices.',
          keywords: ['web development services', 'website pricing', 'api development'],
          ogImage: '', canonical: '', noindex: false, priority: '0.9'
        },
        websites: {
          title: 'Ready-Made Websites For Sale',
          description: 'Buy pre-built business, e-commerce, portfolio and landing page websites — preview each one on video and get it live fast.',
          keywords: ['websites for sale', 'ready made website', 'buy a website'],
          ogImage: '', canonical: '', noindex: false, priority: '0.8'
        },
        awards: {
          title: 'Awards & Achievements',
          description: 'Awards, recognitions and speaking milestones earned by Sohastics across five years of professional web development work.',
          keywords: ['developer awards', 'achievements', 'recognition'],
          ogImage: '', canonical: '', noindex: false, priority: '0.6'
        },
        about: {
          title: 'About Sohastics — Web Developer',
          description: 'The story behind Sohastics: from weekend hobby projects to full-time web development, and the skills built along the way.',
          keywords: ['about', 'web developer story', 'developer skills'],
          ogImage: '', canonical: '', noindex: false, priority: '0.7'
        },
        contact: {
          title: 'Contact — Start a Web Project',
          description: 'Get in touch with Sohastics for website development, web applications, API work or ongoing maintenance. Every message gets a personal reply.',
          keywords: ['contact web developer', 'hire developer', 'get a quote'],
          ogImage: '', canonical: '', noindex: false, priority: '0.7'
        }
      }
    }
  };

  /* ---------------------------------------------------------------
     Storage helpers
     --------------------------------------------------------------- */
  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  // Local-only write used for the read cache and for seeding defaults.
  // It never talks to the backend.
  function setLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { console.error('CMS cache write failed (storage full or blocked):', e); return false; }
  }

  // Save content. In the admin panel this persists to the database through
  // the API; the local copy is only a cache. On public pages it is local-only
  // (public visitors can never write site content).
  function set(key, value) {
    const sentJson = JSON.stringify(value);
    const cached = setLocal(key, value);
    if (ADMIN_MODE && window.CmsApi && KEY_NAMES[key]) {
      window.CmsApi.pushContent(KEY_NAMES[key], value).then((res) => {
        // The server may normalise what it stored (e.g. uploaded images are
        // turned into file URLs). Adopt that copy unless the admin has
        // already changed the value again.
        if (res && res.ok && res.value !== undefined) {
          try {
            if (localStorage.getItem(key) === sentJson) localStorage.setItem(key, JSON.stringify(res.value));
          } catch (e) {}
        }
      });
      return true;
    }
    return cached;
  }
  function ensureSeeded() {
    if (localStorage.getItem(KEYS.theme) === null) setLocal(KEYS.theme, DEFAULTS.theme);
    if (localStorage.getItem(KEYS.content) === null) setLocal(KEYS.content, DEFAULTS.content);
    if (localStorage.getItem(KEYS.services) === null) setLocal(KEYS.services, DEFAULTS.services);
    if (localStorage.getItem(KEYS.awards) === null) setLocal(KEYS.awards, DEFAULTS.awards);
    if (localStorage.getItem(KEYS.portfolio) === null) setLocal(KEYS.portfolio, DEFAULTS.portfolio);
    if (localStorage.getItem(KEYS.milestones) === null) setLocal(KEYS.milestones, DEFAULTS.milestones);
    if (localStorage.getItem(KEYS.skills) === null) setLocal(KEYS.skills, DEFAULTS.skills);
    if (localStorage.getItem(KEYS.contactInfo) === null) setLocal(KEYS.contactInfo, DEFAULTS.contactInfo);
    if (localStorage.getItem(KEYS.images) === null) setLocal(KEYS.images, DEFAULTS.images);
    if (localStorage.getItem(KEYS.reviews) === null) setLocal(KEYS.reviews, DEFAULTS.reviews);
    if (localStorage.getItem(KEYS.pages) === null) setLocal(KEYS.pages, DEFAULTS.pages);
    if (localStorage.getItem(KEYS.websites) === null) setLocal(KEYS.websites, DEFAULTS.websites);
    if (localStorage.getItem(KEYS.seo) === null) setLocal(KEYS.seo, DEFAULTS.seo);
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  /* ---------------------------------------------------------------
     Theme application
     --------------------------------------------------------------- */
  function applyTheme() {
    const theme = get(KEYS.theme, DEFAULTS.theme);
    if (theme && theme !== 'charcoal-orange') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /* ---------------------------------------------------------------
     Site name / brand mark — updates every logo instance (header,
     footer, admin sidebar, login screen) plus the big Home page
     hero name, on every page, from one setting.
     --------------------------------------------------------------- */
  function renderGlobal() {
    const content = get(KEYS.content, DEFAULTS.content);
    const global = content.global || DEFAULTS.content.global;
    const siteName = (global && global.siteName) || 'AHMED';

    document.querySelectorAll('.logo, .login-logo').forEach((el) => {
      const firstNode = el.childNodes[0];
      if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
        firstNode.textContent = siteName;
      } else {
        el.insertBefore(document.createTextNode(siteName), el.firstChild || null);
      }
    });

    const heroName = document.querySelector('.hero-name');
    if (heroName) heroName.textContent = siteName;

    document.querySelectorAll('.site-copyright-name').forEach((el) => {
      el.textContent = siteName;
    });
  }

  /* ---------------------------------------------------------------
     Footer + contact-page social / email links (every page)
     --------------------------------------------------------------- */
  function renderContactLinks() {
    const info = get(KEYS.contactInfo, DEFAULTS.contactInfo);

    document.querySelectorAll('a[aria-label="Instagram"]').forEach(a => {
      a.href = info.instagram || '#';
    });
    document.querySelectorAll('a[aria-label="YouTube"]').forEach(a => {
      a.href = info.youtube || '#';
    });

    // Contact page specific fields
    const emailLink = document.getElementById('contactEmailValue');
    if (emailLink) {
      emailLink.textContent = info.email || '';
      emailLink.href = 'mailto:' + (info.email || '');
    }
    const whatsappValue = document.getElementById('contactWhatsappValue');
    if (whatsappValue) {
      const digits = (info.whatsapp || '').replace(/[^\d+]/g, '');
      if (digits.replace(/\D/g, '').length >= 7) {
        whatsappValue.innerHTML = `<a href="https://wa.me/${digits.replace(/\D/g, '')}" class="contact-info-value" target="_blank" rel="noopener">${esc(info.whatsapp)}</a>`;
      } else {
        whatsappValue.innerHTML = `<span class="contact-info-value contact-info-muted">${esc(info.whatsapp || 'Available on request — just ask in your message')}</span>`;
      }
    }
  }

  /* ---------------------------------------------------------------
     Thumbnail / photo rendering helper
     --------------------------------------------------------------- */
  function thumbStyle(image) {
    if (image) {
      return `background-image:url('${image}');background-size:cover;background-position:center;`;
    }
    return '';
  }

  /* ================================================================
     HOME PAGE
     ================================================================ */
  // Home page showcase rule: pinned ("featured") items come first, then the
  // newest remaining items fill the grid so it always shows at least
  // HOME_MIN_ITEMS (when that many exist). Never more than HOME_MAX_ITEMS.
  const HOME_MIN_ITEMS = 6, HOME_MAX_ITEMS = 12;
  function pickHomeItems(items) {
    const list = Array.isArray(items) ? items : [];
    const pinned = list.filter(i => i.featured);
    const others = list.filter(i => !i.featured).reverse(); // newest added first
    const out = pinned.slice();
    for (let i = 0; i < others.length && out.length < HOME_MIN_ITEMS; i++) out.push(others[i]);
    return out.slice(0, HOME_MAX_ITEMS);
  }

  function renderHome() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const c = get(KEYS.content, DEFAULTS.content).home || DEFAULTS.content.home;
    const images = get(KEYS.images, DEFAULTS.images);
    const services = get(KEYS.services, DEFAULTS.services);
    const portfolio = get(KEYS.portfolio, DEFAULTS.portfolio);

    const roleEl = document.querySelector('.hero-role');
    if (roleEl) roleEl.innerHTML = `${esc(c.heroRoleLeft)} <span class="slash">/</span> ${esc(c.heroRoleRight)}`;
    const taglineEl = document.querySelector('.hero-tagline');
    if (taglineEl) taglineEl.textContent = '\u201C' + c.heroTagline + '\u201D';

    const metaNums = document.querySelectorAll('.hero-meta .meta-num');
    if (metaNums[0]) metaNums[0].textContent = String(c.statsYears).padStart(2, '0');
    if (metaNums[1]) metaNums[1].textContent = c.statsVideos + '+';

    // hero photo
    if (images.homePhoto) {
      const frame = document.querySelector('.frame-monitor');
      const existing = frame && frame.querySelector('.headshot-placeholder');
      if (existing) {
        const img = document.createElement('img');
        img.src = images.homePhoto;
        img.className = 'headshot-placeholder';
        img.alt = 'Profile photo';
        existing.replaceWith(img);
      }
      const caption = document.querySelector('.frame-caption');
      if (caption) caption.textContent = 'Profile photo';
    }

    // stats counters
    const statMap = { 0: c.statsVideos, 1: c.statsClients, 2: c.statsYears, 3: c.statsRating };
    document.querySelectorAll('.stat-number').forEach((el, i) => {
      if (statMap[i] !== undefined) el.dataset.countTo = statMap[i];
    });

    // services teaser (mirrors services array, no price)
    const servicesGrid = document.querySelector('.services-grid');
    if (servicesGrid) {
      const sectionTitle = document.querySelector('#services .section-title');
      if (sectionTitle) sectionTitle.textContent = c.servicesSectionTitle;
      servicesGrid.innerHTML = services.map(s => `
        <div class="service-card reveal-item">
          <div class="service-icon" aria-hidden="true">${iconSvg(s.icon, 26)}</div>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.desc)}</p>
        </div>`).join('');
    }

    // featured work (portfolio items marked featured)
    const workGrid = document.querySelector('.work-grid');
    if (workGrid) {
      const featured = pickHomeItems(portfolio);
      const workEmpty = document.getElementById('workGridEmpty');
      if (workEmpty) workEmpty.hidden = featured.length > 0;
      workGrid.innerHTML = featured.map(p => `
        <a href="portfolio.html" class="work-card reveal-item" style="--tone:var(--${p.tone === 'orange' ? 'orange' : 'blue'})">
          <div class="work-thumb" style="${thumbStyle(p.image)}">
            <div class="thumb-corner tl"></div><div class="thumb-corner br"></div>
            <span class="thumb-play">${PLAY_TRIANGLE.replace('<path', '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path').replace('/>', '/></svg>')}</span>
            <span class="thumb-tc">${esc(p.tc)}</span>
          </div>
          <div class="work-info"><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p></div>
        </a>`).join('');
    }

    // closing CTA
    const ctaTitle = document.querySelector('#contact-cta .cta-title');
    const ctaSub = document.querySelector('#contact-cta .cta-sub');
    if (ctaTitle) ctaTitle.textContent = c.ctaTitle;
    if (ctaSub) ctaSub.textContent = c.ctaSub;

    // Worked With (Brands marquee) section toggle
    const brandsSection = document.getElementById('brands');
    if (brandsSection) {
      brandsSection.style.display = c.showBrands === false ? 'none' : '';
    }
  }

  /* ---------------------------------------------------------------
     Approved reviews — appended into the Home page testimonial
     slider alongside the built-in quotes. Submitted via the "Write
     a Review" button; only shown once approved in the Admin Panel.
     --------------------------------------------------------------- */
  function renderReviews() {
    const track = document.getElementById('testiTrack');
    if (!track) return;

    // Remove any previously injected review cards so re-renders
    // (e.g. after an Admin approval) don't create duplicates.
    track.querySelectorAll('.testi-card-dynamic').forEach((el) => el.remove());

    const reviews = get(KEYS.reviews, []);
    const approved = reviews.filter((r) => r.approved);

    approved.forEach((r) => {
      const rating = Math.max(1, Math.min(5, r.rating || 5));
      const stars = '★★★★★'.slice(0, rating) + '☆☆☆☆☆'.slice(0, 5 - rating);
      const card = document.createElement('blockquote');
      card.className = 'testi-card testi-card-dynamic';
      card.innerHTML =
        '<div class="testi-stars" aria-hidden="true">' + stars + '</div>' +
        '<p>&ldquo;' + esc(r.message) + '&rdquo;</p>' +
        '<footer><span class="testi-name">' + esc(r.name) + '</span><span class="testi-role">Verified Client</span></footer>';
      track.appendChild(card);
    });
  }

  /* ================================================================
     PORTFOLIO PAGE
     ================================================================ */
  function renderPortfolio() {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;
    const c = get(KEYS.content, DEFAULTS.content).portfolio || DEFAULTS.content.portfolio;
    const items = get(KEYS.portfolio, DEFAULTS.portfolio);

    const titleEl = document.querySelector('.page-header .page-title');
    const subEl = document.querySelector('.page-header .page-sub');
    if (titleEl) titleEl.textContent = c.pageTitle;
    if (subEl) subEl.textContent = c.pageSub;

    const catLabel = { longform: 'Web Applications', reels: 'Landing Pages', color: 'E-commerce & Backend' };

    const gridEmpty = document.getElementById('gridEmptyState');
    if (!items.length) {
      grid.innerHTML = '';
      if (gridEmpty) { gridEmpty.textContent = 'New projects are being added soon — check back shortly.'; gridEmpty.hidden = false; }
      return;
    }
    grid.innerHTML = items.map(p => `
      <button class="project-card reveal-item" data-category="${p.category}" style="--tone:var(--${p.tone === 'orange' ? 'orange' : 'blue'})"
        data-title="${esc(p.title)}" data-tc="${esc(p.tc)}" data-desc="${esc(p.desc)}" data-tag="${esc(catLabel[p.category] || '')}" data-video="${esc(p.video || '')}">
        <span class="project-thumb" style="${thumbStyle(p.image)}">
          <span class="thumb-corner tl"></span><span class="thumb-corner br"></span>
          <span class="thumb-play"><svg width="20" height="20" viewBox="0 0 18 18" fill="none">${PLAY_TRIANGLE}</svg></span>
          <span class="thumb-tc">${esc(p.tc)}</span>
        </span>
        <span class="project-info">
          <span class="project-title">${esc(p.title)}</span>
          <span class="project-desc">${esc(p.desc)}</span>
        </span>
      </button>`).join('');
  }

  /* ================================================================
     WEBSITES FOR SALE — video URL helper
     ================================================================ */
  // Uploaded videos are stored by the backend and referenced by a normal URL,
  // so there is nothing to resolve. (Kept as a promise-returning helper
  // because main.js already calls it that way.)
  function resolveVideoUrl(value) {
    return Promise.resolve(value || null);
  }

  function videoEmbedSrc(url) {
    if (!url) return null;
    const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
    if (yt) return { type: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
    return { type: 'video', src: url };
  }

  /* ================================================================
     WEBSITES FOR SALE — Home page teaser (featured items only)
     ================================================================ */
  function renderWebsitesTeaser() {
    const grid = document.getElementById('websitesTeaserGrid');
    if (!grid) return;
    const items = pickHomeItems(get(KEYS.websites, DEFAULTS.websites));
    const empty = document.getElementById('websitesTeaserEmpty');

    if (!items.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    grid.innerHTML = items.map(w => `
      <article class="website-card reveal-item">
        <div class="website-card-thumb" style="${thumbStyle(w.image)}">
          ${w.video ? `<span class="thumb-play"><svg width="20" height="20" viewBox="0 0 18 18" fill="none">${PLAY_TRIANGLE}</svg></span>` : ''}
          ${w.image ? '' : '<span class="website-card-thumb-fallback"><svg width="30" height="30" viewBox="0 0 24 24" fill="none"><rect x="3" y="4.5" width="18" height="15" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h18" stroke="currentColor" stroke-width="1.6"/></svg></span>'}
        </div>
        <p class="website-tag">${esc(WEBSITE_CATEGORIES[w.category] || w.category)}</p>
        <h3 class="website-title">${esc(w.title)}</h3>
        <p class="website-desc">${esc(w.desc)}</p>
        <div class="website-price">
          <span class="price-amount">$${esc(w.price)}</span>
          <span class="price-unit">one-time</span>
        </div>
        <a href="websites.html" class="btn btn-ghost">${w.video ? 'Preview' : 'View Details'}</a>
      </article>`).join('');
  }

  /* ================================================================
     WEBSITES FOR SALE — dedicated shop page
     ================================================================ */
  function renderWebsitesPage() {
    const grid = document.getElementById('websitesGrid');
    if (!grid) return;
    const items = get(KEYS.websites, DEFAULTS.websites);
    const tabsWrap = document.getElementById('websitesFilterTabs');
    const emptyState = document.getElementById('websitesGridEmpty');

    // Build filter tabs from whichever categories actually have items,
    // in a stable, sensible order.
    if (tabsWrap) {
      const present = Object.keys(WEBSITE_CATEGORIES).filter(key => items.some(w => w.category === key));
      const prevActive = tabsWrap.querySelector('.filter-tab.is-active');
      const activeFilter = prevActive ? prevActive.dataset.filter : 'all';
      tabsWrap.innerHTML = `<button class="filter-tab" data-filter="all" role="tab">All Websites</button>` +
        present.map(key => `<button class="filter-tab" data-filter="${key}" role="tab">${esc(WEBSITE_CATEGORIES[key])}</button>`).join('') +
        `<span class="filter-pill" id="websitesFilterPill" aria-hidden="true"></span>`;
      const restored = tabsWrap.querySelector(`.filter-tab[data-filter="${activeFilter}"]`) || tabsWrap.querySelector('.filter-tab');
      if (restored) { restored.classList.add('is-active'); restored.setAttribute('aria-selected', 'true'); }
    }

    if (!items.length) {
      grid.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      return;
    }
    if (emptyState) emptyState.hidden = true;

    grid.innerHTML = items.map(w => `
      <button class="website-shop-card reveal-item" data-category="${esc(w.category)}"
        data-title="${esc(w.title)}" data-desc="${esc(w.desc)}" data-price="${esc(w.price)}"
        data-category-label="${esc(WEBSITE_CATEGORIES[w.category] || w.category)}" data-video="${esc(w.video || '')}">
        <span class="website-shop-thumb" style="${thumbStyle(w.image)}">
          <span class="thumb-corner tl"></span><span class="thumb-corner br"></span>
          ${w.video ? `<span class="thumb-play"><svg width="20" height="20" viewBox="0 0 18 18" fill="none">${PLAY_TRIANGLE}</svg></span>` : ''}
          <span class="website-shop-cat-badge">${esc(WEBSITE_CATEGORIES[w.category] || w.category)}</span>
        </span>
        <span class="website-shop-info">
          <span class="website-shop-title">${esc(w.title)}</span>
          <span class="website-shop-desc">${esc(w.desc)}</span>
          <span class="website-shop-footer">
            <span class="website-shop-price">$${esc(w.price)}</span>
            <span class="btn btn-ghost website-shop-cta">${w.video ? 'Preview' : 'View Details'}</span>
          </span>
        </span>
      </button>`).join('');
  }

  /* ================================================================
     SERVICES PAGE
     ================================================================ */
  function renderServices() {
    const grid = document.querySelector('.pricing-grid');
    if (!grid) return;
    const c = get(KEYS.content, DEFAULTS.content).services || DEFAULTS.content.services;
    const services = get(KEYS.services, DEFAULTS.services);

    const titleEl = document.querySelector('.page-header .page-title');
    const subEl = document.querySelector('.page-header .page-sub');
    const noteEl = document.querySelector('.pricing-note');
    if (titleEl) titleEl.textContent = c.pageTitle;
    if (subEl) subEl.textContent = c.pageSub;
    if (noteEl) noteEl.textContent = c.note;

    grid.innerHTML = services.map(s => `
      <article class="pricing-card reveal-item">
        <div class="pricing-icon" aria-hidden="true">${iconSvg(s.icon, 28)}</div>
        <h3 class="pricing-title">${esc(s.title)}</h3>
        <p class="pricing-desc">${esc(s.desc)}</p>
        <div class="pricing-footer">
          <div class="pricing-price">
            <span class="price-label">Starting at</span>
            <span class="price-amount">$${esc(s.price)}<span class="price-unit">${esc(s.unit)}</span></span>
          </div>
          <a href="contact.html" class="btn btn-ghost pricing-cta">Get Started</a>
        </div>
      </article>`).join('');
  }

  /* ================================================================
     AWARDS PAGE
     ================================================================ */
  function renderTimelineItems(container, items, opts) {
    if (!container) return;
    const showOrg = opts && opts.showOrg;
    const html = items.map((item, i) => {
      const side = i % 2 === 0 ? 'left' : 'right';
      return `
        <article class="timeline-item timeline-item--${side} reveal-item" data-reveal="${side}">
          <div class="timeline-node"><span class="timeline-dot"></span></div>
          <div class="timeline-card">
            <span class="timeline-year">${esc(item.year)}</span>
            <div class="timeline-icon" aria-hidden="true">${iconSvg(item.icon, 24)}</div>
            <h3 class="timeline-title">${esc(item.title)}</h3>
            ${showOrg ? `<p class="timeline-org">${esc(item.org || '')}</p>` : ''}
            <p class="timeline-desc">${esc(item.desc)}</p>
          </div>
        </article>`;
    }).join('');
    // preserve the spine element, replace only item articles
    const spine = container.querySelector('.timeline-spine');
    container.innerHTML = '';
    if (spine) container.appendChild(spine);
    container.insertAdjacentHTML('beforeend', html);
  }

  function renderAwards() {
    const container = document.getElementById('achievementsTimeline');
    if (!container) return;
    const c = get(KEYS.content, DEFAULTS.content).awards || DEFAULTS.content.awards;
    const awards = get(KEYS.awards, DEFAULTS.awards);

    const titleEl = document.querySelector('.page-header .page-title');
    const subEl = document.querySelector('.page-header .page-sub');
    if (titleEl) titleEl.textContent = c.pageTitle;
    if (subEl) subEl.textContent = c.pageSub;

    renderTimelineItems(container, awards, { showOrg: true });
  }

  /* ================================================================
     ABOUT PAGE
     ================================================================ */
  function renderAbout() {
    const narrative = document.querySelector('.about-narrative-copy');
    if (!narrative) return;
    const c = get(KEYS.content, DEFAULTS.content).about || DEFAULTS.content.about;
    const images = get(KEYS.images, DEFAULTS.images);
    const milestones = get(KEYS.milestones, DEFAULTS.milestones);
    const skills = get(KEYS.skills, DEFAULTS.skills);

    const titleEl = document.querySelector('.page-header .page-title');
    if (titleEl) titleEl.textContent = c.pageTitle;

    narrative.innerHTML = c.paragraphs.map(p =>
      `<p class="${p.highlight ? 'about-highlight' : ''}">${esc(p.text)}</p>`
    ).join('');

    if (images.aboutPhoto) {
      const frame = document.querySelector('.about-frame');
      const existing = frame && frame.querySelector('.headshot-placeholder');
      if (existing) {
        const img = document.createElement('img');
        img.src = images.aboutPhoto;
        img.className = 'headshot-placeholder';
        img.alt = 'Profile photo';
        existing.replaceWith(img);
      }
      const caption = document.querySelector('.frame-caption');
      if (caption) caption.textContent = 'Profile photo';
    }

    const milestoneContainer = document.getElementById('milestoneTimeline');
    renderTimelineItems(milestoneContainer, milestones, { showOrg: false });

    const skillsList = document.getElementById('skillsList');
    if (skillsList) {
      skillsList.innerHTML = skills.map(s => `
        <div class="skill-meter" data-skill-value="${esc(s.value)}">
          <div class="skill-meter-head">
            <span class="skill-name">${esc(s.name)}</span>
            <span class="skill-percent"><span class="skill-percent-num">0</span>%</span>
          </div>
          <div class="skill-track"><div class="skill-fill"></div></div>
        </div>`).join('');
    }
  }

  /* ================================================================
     CONTACT PAGE
     ================================================================ */
  function renderContactPage() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const c = get(KEYS.content, DEFAULTS.content).contact || DEFAULTS.content.contact;

    const titleEl = document.querySelector('.page-header .page-title');
    const subEl = document.querySelector('.page-header .page-sub');
    if (titleEl) titleEl.textContent = c.pageTitle;
    if (subEl) subEl.textContent = c.pageSub;
  }

  /* ================================================================
     PAGE VISIBILITY CONTROL
     ================================================================ */
  const PAGE_MAP = {
    'index.html': 'home',
    'portfolio.html': 'portfolio',
    'services.html': 'services',
    'awards.html': 'awards',
    'about.html': 'about',
    'contact.html': 'contact',
    'websites.html': 'websites'
  };

  function getCurrentPageKey() {
    let path = window.location.pathname.split('/').pop() || 'index.html';
    if (!path || path === '' || path === '/') path = 'index.html';
    return PAGE_MAP[path] || null;
  }

  function renderPageVisibility() {
    const pages = get(KEYS.pages, DEFAULTS.pages);

    // 1. Hide/show nav links across header and footer for disabled pages
    Object.keys(PAGE_MAP).forEach(pageFile => {
      const pageKey = PAGE_MAP[pageFile];
      const isEnabled = pages[pageKey] !== false;

      document.querySelectorAll(`#mainNav a[href="${pageFile}"]`).forEach(a => {
        a.style.display = isEnabled ? '' : 'none';
      });

      document.querySelectorAll(`.footer-links a[href="${pageFile}"]`).forEach(a => {
        a.style.display = isEnabled ? '' : 'none';
      });
    });

    // Header CTA button ("Let's Talk" -> contact.html)
    const navCta = document.querySelector('.nav-cta');
    if (navCta && navCta.getAttribute('href') === 'contact.html') {
      navCta.style.display = pages.contact !== false ? '' : 'none';
    }

    // 2. Check if current active page is disabled
    const currentKey = getCurrentPageKey();
    if (currentKey && pages[currentKey] === false) {
      const mainEl = document.querySelector('main');
      if (mainEl && !document.body.classList.contains('admin-body')) {
        let disabledWrap = document.getElementById('disabledPageOverlay');
        if (!disabledWrap) {
          disabledWrap = document.createElement('div');
          disabledWrap.id = 'disabledPageOverlay';
          disabledWrap.className = 'disabled-page-container';
          disabledWrap.innerHTML = `
            <div class="disabled-page-card">
              <div class="disabled-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="var(--orange)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <h1 class="disabled-title">Page Offline</h1>
              <p class="disabled-sub">This page has been temporarily disabled by the administrator. Please check back later.</p>
              <div class="disabled-actions">
                ${pages.home !== false ? '<a href="index.html" class="btn btn-primary">Return to Home Page</a>' : ''}
              </div>
            </div>
          `;
          mainEl.innerHTML = '';
          mainEl.appendChild(disabledWrap);
        }
      }
    }
  }

  /* ================================================================
     ANALYTICS ENGINE
     First-party and lightweight. Every public page reports a pageview and
     a heartbeat for this browser tab to the backend, which stores them and
     powers the Analytics tab in the admin panel (real, all-visitor data).
     Nothing is stored in the browser except a per-tab session id.
     ================================================================ */

  const ANALYTICS_HEARTBEAT_MS = 15 * 1000;

  function analyticsSessionId() {
    const SKEY = NS + 'session';
    let raw = null;
    try { raw = sessionStorage.getItem(SKEY); } catch (e) {}
    if (raw) return raw;
    const id = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    try { sessionStorage.setItem(SKEY, id); } catch (e) {}
    return id;
  }

  function analyticsDetectDevice() {
    const ua = navigator.userAgent || '';
    const w = window.innerWidth || screen.width || 0;
    if (/tablet|ipad/i.test(ua) || (w >= 600 && w < 1024 && /Mobi/i.test(ua))) return 'tablet';
    if (/Mobi|Android(?!.*Tablet)|iPhone/i.test(ua) || w < 640) return 'mobile';
    return 'desktop';
  }

  function analyticsDetectBrowser() {
    const ua = navigator.userAgent || '';
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    return 'Other';
  }

  function analyticsReferrerSource() {
    const ref = document.referrer || '';
    if (!ref) return 'Direct';
    try {
      const host = new URL(ref).hostname.replace(/^www\./, '');
      if (!host || host === window.location.hostname) return 'Direct';
      if (/google\./.test(host)) return 'Google';
      if (/bing\./.test(host)) return 'Bing';
      if (/duckduckgo\./.test(host)) return 'DuckDuckGo';
      if (/yahoo\./.test(host)) return 'Yahoo';
      if (/instagram\./.test(host)) return 'Instagram';
      if (/facebook\.|fb\./.test(host)) return 'Facebook';
      if (/t\.co|twitter\.|x\.com/.test(host)) return 'X / Twitter';
      if (/linkedin\./.test(host)) return 'LinkedIn';
      if (/youtube\./.test(host)) return 'YouTube';
      if (/whatsapp\./.test(host)) return 'WhatsApp';
      if (/reddit\./.test(host)) return 'Reddit';
      return host;
    } catch (e) { return 'Direct'; }
  }

  function analyticsBeat(pageKey) {
    if (!window.CmsApi) return;
    try { window.CmsApi.sendHeartbeat(analyticsSessionId(), pageKey, analyticsDetectDevice()); } catch (e) {}
  }

  function analyticsTrackPageview(pageKey) {
    if (!pageKey || !window.CmsApi) return;
    // The first pageview of this tab's session carries the real referrer;
    // later in-site navigation is attributed as internal.
    const SEEN = NS + 'session_seen';
    let firstInSession = true;
    try {
      if (sessionStorage.getItem(SEEN)) firstInSession = false;
      else sessionStorage.setItem(SEEN, '1');
    } catch (e) {}

    const record = {
      page: pageKey,
      sid: analyticsSessionId(),
      ref: firstInSession ? analyticsReferrerSource() : 'Internal',
      device: analyticsDetectDevice(),
      browser: analyticsDetectBrowser(),
      newSession: firstInSession
    };
    try { window.CmsApi.trackEvent(record); } catch (e) {}
    analyticsBeat(pageKey);
  }

  function analyticsTrackEvent(type, label) {
    if (!window.CmsApi) return;
    try {
      window.CmsApi.trackEvent({ page: getCurrentPageKey(), sid: analyticsSessionId(), evt: type, label: label || '' });
    } catch (e) {}
  }

  let _analyticsStarted = false;
  function initAnalyticsTracking() {
    if (_analyticsStarted) return; // renderAll() re-runs on every content refresh; track once per page load
    if (ADMIN_MODE || (document.body && document.body.classList.contains('admin-body'))) return;
    const pageKey = getCurrentPageKey();
    if (!pageKey) return;
    _analyticsStarted = true;

    analyticsTrackPageview(pageKey);

    const beat = () => analyticsBeat(pageKey);
    const timer = setInterval(beat, ANALYTICS_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    window.addEventListener('pagehide', () => clearInterval(timer));

    // A soft conversion signal: the contact form was actually submitted.
    document.addEventListener('submit', (e) => {
      const f = e.target;
      if (f && f.id === 'contactForm') analyticsTrackEvent('lead', 'contact_form');
    }, true);
  }


  /* ================================================================
     SEO ENGINE
     Applies every saved SEO setting to the <head> of whichever public
     page is currently loading: title, meta description, keywords/tags,
     canonical URL, robots rules, Open Graph + Twitter cards, JSON-LD
     structured data, analytics and search-console verification.
     ================================================================ */

  // Page key -> file name, label and sensible sitemap priority.
  const SEO_PAGES = [
    { key: 'home',      file: 'index.html',     label: 'Home Page',        priority: '1.0' },
    { key: 'portfolio', file: 'portfolio.html', label: 'Portfolio',        priority: '0.9' },
    { key: 'services',  file: 'services.html',  label: 'Services',         priority: '0.9' },
    { key: 'websites',  file: 'websites.html',  label: 'Websites For Sale', priority: '0.8' },
    { key: 'awards',    file: 'awards.html',    label: 'Awards',           priority: '0.6' },
    { key: 'about',     file: 'about.html',     label: 'About',            priority: '0.7' },
    { key: 'contact',   file: 'contact.html',   label: 'Contact',          priority: '0.7' }
  ];

  /* ---- tiny <head> helpers: create the tag if it isn't there ---- */
  function upsertMeta(attr, name, content) {
    if (content === null || content === undefined || content === '') {
      const stale = document.head.querySelector(`meta[${attr}="${name}"]`);
      if (stale && stale.dataset.cmsSeo === '1') stale.remove();
      return;
    }
    let el = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.dataset.cmsSeo = '1';
    el.setAttribute('content', content);
  }

  function upsertLink(rel, href, extra) {
    if (!href) {
      const stale = document.head.querySelector(`link[rel="${rel}"][data-cms-seo="1"]`);
      if (stale) stale.remove();
      return;
    }
    let el = document.head.querySelector(`link[rel="${rel}"][data-cms-seo="1"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      el.dataset.cmsSeo = '1';
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
    if (extra) Object.keys(extra).forEach(k => el.setAttribute(k, extra[k]));
  }

  function joinUrl(base, file) {
    if (!base) return '';
    return base.replace(/\/+$/, '') + '/' + String(file).replace(/^\/+/, '');
  }

  /* ---- resolve the effective SEO values for the current page ---- */
  function resolveSeo(pageKey) {
    const seo = get(KEYS.seo, DEFAULTS.seo) || DEFAULTS.seo;
    const g = Object.assign({}, DEFAULTS.seo.global, seo.global || {});
    const pageDefaults = (DEFAULTS.seo.pages && DEFAULTS.seo.pages[pageKey]) || {};
    const p = Object.assign({}, pageDefaults, (seo.pages && seo.pages[pageKey]) || {});
    const meta = SEO_PAGES.find(x => x.key === pageKey) || SEO_PAGES[0];

    const baseTitle = (p.title || g.defaultTitle || g.brandName || 'Website').trim();
    const suffix = (g.titleSuffix || '').trim();
    // Don't double up the suffix if the page title already ends with it.
    const fullTitle = (suffix && baseTitle.toLowerCase().indexOf(suffix.replace(/^[\s—\-|]+/, '').toLowerCase()) === -1)
      ? baseTitle + ' ' + suffix
      : baseTitle;

    const keywords = []
      .concat(Array.isArray(p.keywords) ? p.keywords : [])
      .concat(Array.isArray(g.defaultKeywords) ? g.defaultKeywords : [])
      .map(k => String(k).trim())
      .filter(Boolean);
    const uniqueKeywords = keywords.filter((k, i) => keywords.findIndex(x => x.toLowerCase() === k.toLowerCase()) === i);

    return {
      g: g,
      p: p,
      file: meta.file,
      priority: p.priority || meta.priority,
      title: fullTitle,
      rawTitle: baseTitle,
      description: (p.description || g.defaultDescription || '').trim(),
      keywords: uniqueKeywords,
      image: p.ogImage || g.ogImage || '',
      canonical: p.canonical || joinUrl(g.siteUrl, meta.file),
      noindex: p.noindex === true || g.robotsIndex === false
    };
  }

  /* ---- JSON-LD structured data (Person + WebSite + Breadcrumb) ---- */
  function buildStructuredData(r, pageKey) {
    const info = get(KEYS.contactInfo, DEFAULTS.contactInfo) || {};
    const sameAs = [info.instagram, info.youtube, info.linkedin, info.github, r.g.twitterHandle ? 'https://twitter.com/' + String(r.g.twitterHandle).replace(/^@/, '') : '']
      .filter(u => u && u !== '#');

    const person = {
      '@type': r.g.entityType === 'Organization' ? 'Organization' : 'Person',
      '@id': (r.g.siteUrl || '') + '#identity',
      name: r.g.brandName || 'Sohastics',
      url: r.g.siteUrl || undefined,
      image: r.image || undefined,
      description: r.g.defaultDescription || undefined,
      email: info.email ? 'mailto:' + info.email : undefined,
      sameAs: sameAs.length ? sameAs : undefined
    };
    if (person['@type'] === 'Person') {
      person.jobTitle = r.g.jobTitle || undefined;
      if (r.g.knowsAbout) {
        person.knowsAbout = String(r.g.knowsAbout).split(',').map(s => s.trim()).filter(Boolean);
      }
      if (r.g.addressLocality || r.g.addressCountry) {
        person.address = {
          '@type': 'PostalAddress',
          addressLocality: r.g.addressLocality || undefined,
          addressCountry: r.g.addressCountry || undefined
        };
      }
    }

    const graph = [
      person,
      {
        '@type': 'WebSite',
        '@id': (r.g.siteUrl || '') + '#website',
        url: r.g.siteUrl || undefined,
        name: r.g.brandName || undefined,
        description: r.g.defaultDescription || undefined,
        inLanguage: r.g.lang || 'en',
        publisher: { '@id': (r.g.siteUrl || '') + '#identity' }
      },
      {
        '@type': 'WebPage',
        '@id': r.canonical ? r.canonical + '#webpage' : undefined,
        url: r.canonical || undefined,
        name: r.title,
        description: r.description || undefined,
        isPartOf: { '@id': (r.g.siteUrl || '') + '#website' },
        about: { '@id': (r.g.siteUrl || '') + '#identity' },
        inLanguage: r.g.lang || 'en'
      }
    ];

    if (pageKey !== 'home' && r.g.siteUrl) {
      const label = (SEO_PAGES.find(x => x.key === pageKey) || {}).label || '';
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: joinUrl(r.g.siteUrl, 'index.html') },
          { '@type': 'ListItem', position: 2, name: label, item: r.canonical }
        ]
      });
    }

    // Services get an offer catalogue so pricing can win rich results.
    if (pageKey === 'services') {
      const services = get(KEYS.services, DEFAULTS.services) || [];
      if (services.length) {
        graph.push({
          '@type': 'OfferCatalog',
          name: 'Services',
          itemListElement: services.map((s, i) => ({
            '@type': 'Offer',
            position: i + 1,
            name: s.title,
            description: s.desc,
            price: String(s.price || '').replace(/[^\d.]/g, '') || undefined,
            priceCurrency: r.g.currency || 'USD'
          }))
        });
      }
    }

    return { '@context': 'https://schema.org', '@graph': graph };
  }

  /* ---- the main entry point, run on every public page load ---- */
  function renderSEO() {
    if (document.body && document.body.classList.contains('admin-body')) return;
    const pageKey = getCurrentPageKey();
    if (!pageKey) return;

    const r = resolveSeo(pageKey);
    const g = r.g;

    // Document language
    if (g.lang) document.documentElement.setAttribute('lang', g.lang);

    // Title + core meta
    document.title = r.title;
    upsertMeta('name', 'description', r.description);
    upsertMeta('name', 'keywords', r.keywords.join(', '));
    upsertMeta('name', 'author', g.author || g.brandName || '');
    upsertMeta('name', 'theme-color', g.themeColor || '');
    upsertMeta('name', 'robots', r.noindex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    upsertMeta('name', 'googlebot', r.noindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('name', 'generator', '');
    if (g.geoRegion) upsertMeta('name', 'geo.region', g.geoRegion);
    if (g.addressLocality) upsertMeta('name', 'geo.placename', g.addressLocality);

    // Canonical + alternate
    upsertLink('canonical', r.canonical);
    if (r.canonical && g.lang) {
      upsertLink('alternate', r.canonical, { hreflang: g.lang });
    }

    // Open Graph
    upsertMeta('property', 'og:type', pageKey === 'home' ? 'website' : 'article');
    upsertMeta('property', 'og:site_name', g.brandName || '');
    upsertMeta('property', 'og:title', r.title);
    upsertMeta('property', 'og:description', r.description);
    upsertMeta('property', 'og:url', r.canonical);
    upsertMeta('property', 'og:locale', g.locale || 'en_US');
    upsertMeta('property', 'og:image', r.image);
    if (r.image) {
      upsertMeta('property', 'og:image:width', '1200');
      upsertMeta('property', 'og:image:height', '630');
      upsertMeta('property', 'og:image:alt', r.title);
    }

    // Twitter / X card
    upsertMeta('name', 'twitter:card', r.image ? 'summary_large_image' : 'summary');
    upsertMeta('name', 'twitter:title', r.title);
    upsertMeta('name', 'twitter:description', r.description);
    upsertMeta('name', 'twitter:image', r.image);
    if (g.twitterHandle) {
      const handle = '@' + String(g.twitterHandle).replace(/^@/, '');
      upsertMeta('name', 'twitter:site', handle);
      upsertMeta('name', 'twitter:creator', handle);
    }

    // Search-console verification
    upsertMeta('name', 'google-site-verification', g.googleVerification || '');
    upsertMeta('name', 'msvalidate.01', g.bingVerification || '');

    // Structured data
    let ld = document.getElementById('cmsStructuredData');
    if (g.structuredData === false) {
      if (ld) ld.remove();
    } else {
      if (!ld) {
        ld = document.createElement('script');
        ld.type = 'application/ld+json';
        ld.id = 'cmsStructuredData';
        document.head.appendChild(ld);
      }
      ld.textContent = JSON.stringify(buildStructuredData(r, pageKey), null, 2);
    }

    // Google Analytics 4 — injected once, only if an ID is saved
    if (g.gaId && /^G-[A-Z0-9]+$/i.test(g.gaId.trim()) && !document.getElementById('cmsGaScript')) {
      const s = document.createElement('script');
      s.id = 'cmsGaScript';
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(g.gaId.trim());
      document.head.appendChild(s);
      const inline = document.createElement('script');
      inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${g.gaId.trim()}');`;
      document.head.appendChild(inline);
    }

    // Lazy-load images the CMS didn't place itself, and backfill any
    // missing alt text from the page title — both are ranking factors.
    document.querySelectorAll('main img:not([loading])').forEach(img => {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
    });
    document.querySelectorAll('main img:not([alt]), main img[alt=""]').forEach(img => {
      img.setAttribute('alt', r.rawTitle);
    });
  }

  /* ---- sitemap.xml / robots.txt text, generated for the admin UI ---- */
  function buildSitemap() {
    const seo = get(KEYS.seo, DEFAULTS.seo) || DEFAULTS.seo;
    const g = Object.assign({}, DEFAULTS.seo.global, seo.global || {});
    const pages = get(KEYS.pages, DEFAULTS.pages) || {};
    const base = (g.siteUrl || 'https://example.com').replace(/\/+$/, '');
    const today = new Date().toISOString().slice(0, 10);

    const urls = SEO_PAGES.filter(pg => {
      if (pages[pg.key] === false) return false;            // page switched off
      const p = (seo.pages && seo.pages[pg.key]) || {};
      if (p.noindex === true) return false;                  // marked noindex
      return true;
    }).map(pg => {
      const p = (seo.pages && seo.pages[pg.key]) || {};
      const loc = pg.key === 'home' ? base + '/' : base + '/' + pg.file;
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        `    <changefreq>${g.sitemapChangefreq || 'monthly'}</changefreq>`,
        `    <priority>${p.priority || pg.priority}</priority>`,
        '  </url>'
      ].join('\n');
    });

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      urls.join('\n'),
      '</urlset>'
    ].join('\n');
  }

  function buildRobotsTxt() {
    const seo = get(KEYS.seo, DEFAULTS.seo) || DEFAULTS.seo;
    const g = Object.assign({}, DEFAULTS.seo.global, seo.global || {});
    const base = (g.siteUrl || 'https://example.com').replace(/\/+$/, '');
    const lines = ['User-agent: *'];

    if (g.robotsIndex === false) {
      lines.push('Disallow: /');
    } else {
      lines.push('Allow: /');
      lines.push('');
      lines.push('# Keep the admin panel out of search results');
      lines.push('Disallow: /admin/');
      lines.push('Disallow: /api/');
      lines.push('Disallow: /js/');
      const blocked = SEO_PAGES.filter(pg => {
        const p = (seo.pages && seo.pages[pg.key]) || {};
        return p.noindex === true;
      });
      blocked.forEach(pg => lines.push('Disallow: /' + pg.file));
    }

    lines.push('');
    lines.push('Sitemap: ' + base + '/sitemap.xml');
    return lines.join('\n');
  }

  /* ---- static <head> snippet, so the tags also exist in the raw HTML ---- */
  function buildHeadSnippet(pageKey) {
    const r = resolveSeo(pageKey);
    const g = r.g;
    const esc2 = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = [];

    lines.push('<title>' + esc2(r.title) + '</title>');
    lines.push('<meta name="description" content="' + esc2(r.description) + '">');
    if (r.keywords.length) lines.push('<meta name="keywords" content="' + esc2(r.keywords.join(', ')) + '">');
    if (g.author) lines.push('<meta name="author" content="' + esc2(g.author) + '">');
    lines.push('<meta name="robots" content="' + (r.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large') + '">');
    if (r.canonical) lines.push('<link rel="canonical" href="' + esc2(r.canonical) + '">');
    if (g.themeColor) lines.push('<meta name="theme-color" content="' + esc2(g.themeColor) + '">');
    lines.push('');
    lines.push('<!-- Open Graph -->');
    lines.push('<meta property="og:type" content="' + (pageKey === 'home' ? 'website' : 'article') + '">');
    if (g.brandName) lines.push('<meta property="og:site_name" content="' + esc2(g.brandName) + '">');
    lines.push('<meta property="og:title" content="' + esc2(r.title) + '">');
    lines.push('<meta property="og:description" content="' + esc2(r.description) + '">');
    if (r.canonical) lines.push('<meta property="og:url" content="' + esc2(r.canonical) + '">');
    lines.push('<meta property="og:locale" content="' + esc2(g.locale || 'en_US') + '">');
    if (r.image && r.image.indexOf('data:') !== 0) {
      lines.push('<meta property="og:image" content="' + esc2(r.image) + '">');
    } else if (r.image) {
      lines.push('<!-- og:image is an uploaded file; host it and put its URL here -->');
      lines.push('<meta property="og:image" content="' + esc2(joinUrl(g.siteUrl, 'images/share-' + pageKey + '.jpg')) + '">');
    }
    lines.push('');
    lines.push('<!-- Twitter / X -->');
    lines.push('<meta name="twitter:card" content="' + (r.image ? 'summary_large_image' : 'summary') + '">');
    lines.push('<meta name="twitter:title" content="' + esc2(r.title) + '">');
    lines.push('<meta name="twitter:description" content="' + esc2(r.description) + '">');
    if (g.twitterHandle) lines.push('<meta name="twitter:site" content="@' + esc2(String(g.twitterHandle).replace(/^@/, '')) + '">');
    if (g.googleVerification) {
      lines.push('');
      lines.push('<meta name="google-site-verification" content="' + esc2(g.googleVerification) + '">');
    }
    if (g.structuredData !== false) {
      lines.push('');
      lines.push('<script type="application/ld+json">');
      lines.push(JSON.stringify(buildStructuredData(r, pageKey), null, 2));
      lines.push('<\/script>');
    }
    return lines.join('\n');
  }

  /* ---- SEO health audit, consumed by the admin panel ---- */
  function auditSeo() {
    const seo = get(KEYS.seo, DEFAULTS.seo) || DEFAULTS.seo;
    const g = Object.assign({}, DEFAULTS.seo.global, seo.global || {});
    const checks = [];

    function check(ok, label, hint, weight) {
      checks.push({ ok: !!ok, label: label, hint: hint, weight: weight || 1 });
    }

    check(/^https?:\/\/.+\..+/.test(g.siteUrl || ''), 'Site URL is set',
      'Add your live domain so canonical URLs, sitemap and social cards resolve correctly.', 3);
    check((g.defaultDescription || '').length >= 50, 'Default description written',
      'Write a 120–160 character fallback description for pages without their own.', 2);
    check((g.defaultKeywords || []).length >= 3, 'Default keyword tags added',
      'Add at least 3 site-wide tags describing what you do.', 1);
    check(!!g.ogImage, 'Social share image uploaded',
      'Upload a 1200×630 image so links look right when shared.', 2);
    check(!!g.author, 'Author name set', 'Set the author meta so your name is attached to the content.', 1);
    check(g.structuredData !== false, 'Structured data enabled',
      'Schema.org markup helps Google understand who you are and show rich results.', 2);
    check(!!g.gaId, 'Analytics connected',
      'Add a Google Analytics 4 measurement ID to track your traffic.', 1);
    check(!!g.googleVerification, 'Search Console verified',
      'Verify with Google Search Console to see and fix indexing problems.', 1);
    check(g.robotsIndex !== false, 'Site is indexable',
      'Search engine indexing is currently switched off site-wide.', 3);

    SEO_PAGES.forEach(pg => {
      const p = Object.assign({}, (DEFAULTS.seo.pages || {})[pg.key], (seo.pages || {})[pg.key]);
      const t = (p.title || '').trim();
      const d = (p.description || '').trim();
      check(t.length >= 20 && t.length <= 60, `${pg.label}: title length`,
        `Title is ${t.length} characters — aim for 20–60 so it isn't cut off in results.`, 2);
      check(d.length >= 70 && d.length <= 160, `${pg.label}: description length`,
        `Description is ${d.length} characters — aim for 70–160.`, 2);
      check((p.keywords || []).length >= 2, `${pg.label}: tags added`,
        'Add at least 2 focus tags for this page.', 1);
    });

    const total = checks.reduce((s, c) => s + c.weight, 0);
    const earned = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
    return {
      score: total ? Math.round((earned / total) * 100) : 0,
      passed: checks.filter(c => c.ok).length,
      total: checks.length,
      checks: checks
    };
  }


  /* ---------------------------------------------------------------
     Run everything
     --------------------------------------------------------------- */
  function renderAll() {
    applyTheme();
    renderGlobal();
    renderPageVisibility();
    renderContactLinks();
    renderHome();
    renderReviews();
    renderPortfolio();
    renderWebsitesTeaser();
    renderWebsitesPage();
    renderServices();
    renderAwards();
    renderAbout();
    renderContactPage();
    renderSEO();
    initAnalyticsTracking();
    // Let main.js re-bind anything that depends on freshly rendered markup.
    try { window.dispatchEvent(new Event('cms:rendered')); } catch (e) {}
  }

  ensureSeeded();
  applyTheme(); // apply immediately (also done again in renderAll, cheap)

  /* ---- Backend content sync: pull the latest content before first paint,
     then keep checking for changes made from the admin panel. ---- */
  function applyRemoteContentRow(row) {
    if (!row || !row.key || !KEYS[row.key]) return false;
    try {
      const storageKey = KEYS[row.key];
      const json = JSON.stringify(row.value);
      if (localStorage.getItem(storageKey) === json) return false; // unchanged, skip a re-render
      localStorage.setItem(storageKey, json);
      return true;
    } catch (e) { return false; }
  }

  // Resolves true when anything changed, false when unchanged or unreachable.
  async function pullRemoteContent(force) {
    if (!window.CmsApi) return false;
    try {
      const rows = await window.CmsApi.pullContent({ force: !!force });
      if (!rows) return false;
      let changed = false;
      rows.forEach(row => { if (applyRemoteContentRow(row)) changed = true; });
      return changed;
    } catch (e) { console.error('CMS: content pull failed', e); return false; }
  }

  let _pullTimer = null;
  function scheduleRemotePull() {
    clearTimeout(_pullTimer);
    _pullTimer = setTimeout(async () => { if (await pullRemoteContent()) renderAll(); }, 400);
  }

  // Admin panel: called after a successful sign-in (and on demand) to load
  // the full content set, including drafts, from the database.
  // Resolves true if the content was loaded.
  async function reloadFromBackend() {
    if (!window.CmsApi) return false;
    const rows = await window.CmsApi.pullContent({ force: true, timeout: 15000 });
    if (!rows) return false;
    rows.forEach(row => applyRemoteContentRow(row));
    renderAll();
    return true;
  }

  function clearCache() {
    Object.keys(KEYS).forEach((name) => { try { localStorage.removeItem(KEYS[name]); } catch (e) {} });
  }

  async function boot() {
    // The admin panel loads content itself once the admin has signed in.
    if (ADMIN_MODE) { renderAll(); return; }

    // Wait briefly for fresh content before the first paint so visitors don't
    // see stale text flash; if the API is slow, render from the cache and
    // re-render when the content arrives.
    let timedOut = false;
    const pulling = pullRemoteContent();
    await Promise.race([pulling, new Promise(resolve => setTimeout(() => { timedOut = true; resolve(); }, 2500))]);
    renderAll();
    if (timedOut) pulling.then(changed => { if (changed) renderAll(); });
    if (window.CmsApi) window.CmsApi.subscribeContent(scheduleRemotePull);
  }

  let _booted = false;
  document.addEventListener('DOMContentLoaded', function () {
    if (_booted) return;
    _booted = true;
    boot();
  });

  // Live cross-tab updates: when content changes in another tab on this
  // origin, this page re-renders instantly without a refresh.
  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf(NS) === 0) {
      renderAll();
    }
  });

  // Expose for debugging / potential admin iframe use
  window.AhmedCMS = { KEYS, get, set, setLocal, ensureSeeded, renderAll, DEFAULTS, iconSvg, ICONS, WEBSITE_CATEGORIES, videoEmbedSrc, resolveVideoUrl,
                      SEO_PAGES, renderSEO, buildSitemap, buildRobotsTxt, auditSeo, resolveSeo, buildHeadSnippet,
                      reloadFromBackend, clearCache, ADMIN_MODE };
})();
