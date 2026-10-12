# Connecting Supabase

Without this, the site works exactly as before — everything lives in the
browser's local storage, one device at a time. Connecting Supabase adds a
real shared backend: content edited in the admin panel appears on every
device, contact form messages and analytics are collected from *every*
visitor rather than just your own browser, and the admin login is a real
authenticated account instead of a password sitting in plain JavaScript.

It takes about 10 minutes.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is fine).
2. **New project** → pick an organization, name it (e.g. `sohastics`), set a
   database password (save it somewhere — you won't need it for this setup,
   but it's your project's master password), choose the region closest to
   your visitors, and create it. It takes a minute or two to provision.

## 2. Run the schema

1. In your new project, open **SQL Editor** in the left sidebar.
2. **New query**.
3. Open `supabase/schema.sql` from this project, copy its entire contents,
   paste it into the editor, and click **Run**.
4. You should see "Success. No rows returned." This created four tables
   (`site_content`, `messages`, `analytics_events`, `analytics_heartbeats`),
   locked them down with Row Level Security so visitors can only do what
   they're supposed to (submit a message, log a page view — never read or
   edit anything), and turned on realtime updates.

You can re-run this script safely any time — every statement is written to
skip anything that already exists.

## 3. Create your admin login

1. Go to **Authentication → Users** in the sidebar.
2. **Add user** → **Create new user**.
3. Enter the email and password you want to log into the admin panel with.
   Tick **Auto Confirm User** (so you don't need to click an email link).
4. Save.

This is now your real admin login — it replaces the `admin` / `Admin@123`
credentials once Supabase is connected. Nothing else needs to be done here;
the schema's security rules already treat any signed-in user as the admin,
since this site has exactly one.

## 4. Get your API keys

1. Go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://abcdefghijk.supabase.co`).
3. Copy the **anon public** key (a long string starting with `eyJ...`). This
   key is safe to put in client-side code — it can't do anything the Row
   Level Security policies from the schema don't allow.

## 5. Connect the site

Open `js/supabase-config.js` and fill in both values:

```js
window.SUPABASE_CONFIG = {
  url: 'https://abcdefghijk.supabase.co',
  anonKey: 'eyJhbGciOi...'
};
```

Save, upload the updated file to your host, and reload the site. That's it —
no other files need editing.

## 6. Check it worked

1. Open the live site and browse a couple of pages.
2. Open `/admin.html` — the login screen should now ask for an **Email**
   instead of a Username, with a note that you're signing in with your
   Supabase account. Log in with the email/password from step 3.
3. Go to **Settings** → the **Backend Connection** card at the top should
   say *Connected — signed in as your@email.com*.
4. Go to **Analytics** → the *Live Right Now* card should say **All visitors
   (live)** rather than *This device only*, and should show the pages you
   just visited.
5. Submit a test message through the Contact page, then check **Messages**
   in the admin — it should say **All devices** on the Inbox header.

## What syncs and how

| Data | Where it lives | Notes |
|---|---|---|
| Page content (portfolio, services, theme, SEO settings, etc.) | `site_content` table | Whole-value sync — only the admin writes here, so there's no conflict risk. Realtime: edits appear on other open tabs/devices within about a second. |
| Contact messages | `messages` table | Visitors can only insert; only a logged-in admin can read, mark read, or delete. |
| Page views & live visitors | `analytics_events`, `analytics_heartbeats` | Visitors can only insert their own events; only a logged-in admin can read them back. |
| Admin login | Supabase Auth | Real authentication. The old local password still exists as a fallback and is used automatically if Supabase is ever disconnected. |

## Multiple admins

Add more people the same way as step 3 — **Authentication → Users → Add
user**. Every signed-in user is treated as an admin (this schema doesn't
distinguish roles), so only add accounts you trust with full write access.

## Costs

Supabase's free tier comfortably covers a small-to-medium portfolio site:
500 MB database, 5 GB bandwidth/month, unlimited API requests, and 50,000
monthly active users for Auth. Analytics events are the fastest-growing
table — if the site gets heavy traffic, consider periodically trimming old
rows (two commented-out `DELETE` statements are included at the bottom of
`supabase/schema.sql` for this).

## Disconnecting

Clear both values in `js/supabase-config.js` back to `''` and reload. The
site instantly falls back to local-only storage and the legacy admin
password — nothing else changes.


## Video uploads (Portfolio + Websites For Sale)

In the admin panel, every Portfolio project and every Website For Sale
listing has a **Video** field: upload a file (MP4 / WebM / MOV), or paste a
YouTube link or direct video URL.

- **With Supabase connected:** the file is uploaded to the public
  `site-videos` storage bucket and plays for every visitor. Re-run
  `supabase/schema.sql` once so the bucket and its policies exist. The free
  tier allows up to 50 MB per file — for longer screen recordings, compress
  the video or paste a YouTube link.
- **Without Supabase:** the file is stored in that browser's IndexedDB
  (up to 300 MB) and only plays on the same browser. Connect Supabase, or use
  a YouTube link, so visitors on other devices can see it.
