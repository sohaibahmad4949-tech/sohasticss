# Sohastics — Frontend

The public website: plain HTML, CSS and JavaScript — no build step.

All dynamic content (portfolio, services, websites for sale, awards, about text, contact details,
theme, SEO, approved reviews) is loaded from the backend API (`../backend`). The contact form, review
form and visit analytics are sent to the backend, which stores them in its database. The admin panel
is part of the backend and lives at `/admin/`.

```
index.html  portfolio.html  services.html  websites.html  awards.html  about.html  contact.html
css/style.css          all styling and the colour themes
js/api-config.js       where the API is (CMS_API_BASE; empty = same domain)
js/api-client.js       small client for the backend REST API
js/cms.js              renders API content into the pages, SEO tags, analytics pings
js/main.js             animations, navigation, lightbox, contact + review forms
legacy-supabase/       the old Supabase connection (no longer used; kept for reference)
```

## Run it

Easiest: start the backend (`cd ../backend && npm start`) — it serves this folder at `http://localhost:3000`.

To host the frontend separately, upload this folder to any static host, set the API address in
`js/api-config.js` and allow the site's address in the backend's `.env` (`FRONTEND_URL`). See `../backend/README.md`.
