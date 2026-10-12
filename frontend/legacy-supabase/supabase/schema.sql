-- =====================================================================
-- Sohastics website — Supabase backend schema
-- Run this once in Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) SITE CONTENT — every CMS section (portfolio, services, theme,
--    contact info, SEO settings, etc.) as one JSON blob per key.
--    Only the logged-in admin can write; anyone can read, since the
--    public pages need it to render.
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "content_public_read" on public.site_content;
create policy "content_public_read"
  on public.site_content for select
  using (true);

drop policy if exists "content_admin_insert" on public.site_content;
create policy "content_admin_insert"
  on public.site_content for insert
  to authenticated
  with check (true);

drop policy if exists "content_admin_update" on public.site_content;
create policy "content_admin_update"
  on public.site_content for update
  to authenticated
  using (true) with check (true);

drop policy if exists "content_admin_delete" on public.site_content;
create policy "content_admin_delete"
  on public.site_content for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 2) MESSAGES — contact form submissions. Any visitor can submit one;
--    only the logged-in admin can read, mark as read, or delete them.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  name          text not null,
  email         text not null,
  project_type  text,
  budget        text,
  message       text not null,
  read          boolean not null default false
);

alter table public.messages enable row level security;

drop policy if exists "messages_public_insert" on public.messages;
create policy "messages_public_insert"
  on public.messages for insert
  with check (true);

drop policy if exists "messages_admin_read" on public.messages;
create policy "messages_admin_read"
  on public.messages for select
  to authenticated
  using (true);

drop policy if exists "messages_admin_update" on public.messages;
create policy "messages_admin_update"
  on public.messages for update
  to authenticated
  using (true) with check (true);

drop policy if exists "messages_admin_delete" on public.messages;
create policy "messages_admin_delete"
  on public.messages for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 3) ANALYTICS EVENTS — one row per page view / conversion event.
--    Any visitor's browser can insert its own events; only the admin
--    can read them back, so raw visit data is never publicly exposed.
-- ---------------------------------------------------------------------
create table if not exists public.analytics_events (
  id           bigint generated always as identity primary key,
  ts           timestamptz not null default now(),
  page         text,
  sid          text not null,
  ref          text,
  device       text,
  browser      text,
  evt          text,       -- null = pageview, 'lead' = contact form submit, etc.
  label        text,
  new_session  boolean not null default false
);

create index if not exists analytics_events_ts_idx  on public.analytics_events (ts desc);
create index if not exists analytics_events_sid_idx on public.analytics_events (sid);

alter table public.analytics_events enable row level security;

drop policy if exists "events_public_insert" on public.analytics_events;
create policy "events_public_insert"
  on public.analytics_events for insert
  with check (true);

drop policy if exists "events_admin_read" on public.analytics_events;
create policy "events_admin_read"
  on public.analytics_events for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 4) ANALYTICS HEARTBEATS — one row per active browser session,
--    upserted roughly every 15 seconds while a tab is open. Powers the
--    "Live Right Now" panel across every visitor, not just this device.
-- ---------------------------------------------------------------------
create table if not exists public.analytics_heartbeats (
  sid     text primary key,
  last    timestamptz not null default now(),
  page    text,
  device  text
);

alter table public.analytics_heartbeats enable row level security;

drop policy if exists "heartbeats_public_insert" on public.analytics_heartbeats;
create policy "heartbeats_public_insert"
  on public.analytics_heartbeats for insert
  with check (true);

drop policy if exists "heartbeats_public_update" on public.analytics_heartbeats;
create policy "heartbeats_public_update"
  on public.analytics_heartbeats for update
  using (true) with check (true);

drop policy if exists "heartbeats_admin_read" on public.analytics_heartbeats;
create policy "heartbeats_admin_read"
  on public.analytics_heartbeats for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 5) VIDEO STORAGE — public bucket for portfolio / website-for-sale
--    videos uploaded from the admin panel. Anyone can watch; only the
--    logged-in admin can upload, replace or delete. 50 MB per file is
--    the Supabase free-tier ceiling.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-videos', 'site-videos', true, 52428800,
        array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = true, file_size_limit = 52428800,
      allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime'];

drop policy if exists "site_videos_public_read" on storage.objects;
create policy "site_videos_public_read"
  on storage.objects for select
  using (bucket_id = 'site-videos');

drop policy if exists "site_videos_admin_insert" on storage.objects;
create policy "site_videos_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-videos');

drop policy if exists "site_videos_admin_update" on storage.objects;
create policy "site_videos_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-videos') with check (bucket_id = 'site-videos');

drop policy if exists "site_videos_admin_delete" on storage.objects;
create policy "site_videos_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-videos');

-- ---------------------------------------------------------------------
-- Realtime — lets the admin panel and public pages update instantly
-- without polling. Safe to re-run; Supabase ignores duplicates.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.site_content';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.analytics_heartbeats';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.messages';
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Housekeeping: old heartbeats and raw events don't need to live
-- forever. Run this occasionally (or on a Supabase cron/Edge Function)
-- to keep the tables small. Not scheduled automatically.
-- ---------------------------------------------------------------------
-- delete from public.analytics_heartbeats where last < now() - interval '1 day';
-- delete from public.analytics_events where ts < now() - interval '13 months';

-- =====================================================================
-- Done. Next steps (see SUPABASE_SETUP.md):
--   1. Authentication → Providers → make sure Email is enabled.
--   2. Authentication → Users → Add user → create your admin login.
--   3. Project Settings → API → copy the Project URL and anon public key
--      into js/supabase-config.js.
-- =====================================================================
