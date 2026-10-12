// =====================================================================
// BACKEND CONNECTION
//   Default: the backend serves this site, so the API is on the same address.
//   If you open the pages some other way (double-click a .html file, VS Code
//   Live Server on :5500, etc.) the API address is auto-detected as
//   http://localhost:3000 so the site still reaches the server.
//
//   Manual override (pick one):
//     - set CMS_API_BASE below, e.g. 'https://api.example.com'
//       (then add the site's address to FRONTEND_URL / CORS_ORIGINS in backend/.env)
//     - or open any page once with ?api=http://localhost:3000 (remembered in this browser)
//     - ?api=reset forgets the remembered address
// Public pages only read content and submit forms; they never write content.
// =====================================================================
(function () {
  var MANUAL = '';                         // <- set your API address here if needed
  var DEV_API = 'http://localhost:3000';   // where `npm start` in /backend listens
  var base = MANUAL;
  try {
    var m = /[?&]api=([^&#]+)/.exec(location.search);
    if (m) {
      var v = decodeURIComponent(m[1]);
      if (v === 'reset') localStorage.removeItem('sohastics_api_base');
      else localStorage.setItem('sohastics_api_base', v.replace(/\/+$/, ''));
    }
    if (!base) base = localStorage.getItem('sohastics_api_base') || '';
  } catch (e) {}
  if (!base) {
    var local = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    // Opened from disk, or from a dev server that is not the backend itself -> use the backend.
    if (local && location.port !== '3000') base = DEV_API;
  }
  window.CMS_API_BASE = base;
})();
