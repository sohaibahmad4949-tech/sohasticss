# Run the Sohastics site

Needs Node.js 22.13 or newer.

1. Open a terminal in the `backend` folder.
2. `npm start`  (or double-click `start.bat` on Windows)
3. Open **http://localhost:3000** (site) and **http://localhost:3000/admin/** (admin panel).

The backend serves the website, the API, the database and the admin panel together,
so this is the simplest way to run it. Do not use Supabase: it is no longer used.

If the admin password is ever wrong, reset it to the one in `backend/.env`:
`cd backend && npm run admin:create`

Hosting the frontend on a different domain? Set the API address in `frontend/js/api-config.js`
and add the site address to `FRONTEND_URL` / `CORS_ORIGINS` in `backend/.env`.
