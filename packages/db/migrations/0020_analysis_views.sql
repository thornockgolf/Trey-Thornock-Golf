-- When the owning player opened a coach's analysis (the commentary on their video page, or the saved comparison), so
-- the coach can see "Opened by Sam" or "Not opened yet". One row per (analysis, player): the first open stays,
-- the last open moves. Only the app server writes it, and only for the video's owner, never for a coach's preview.
-- Re-recording a part of the analysis does not reset it; the coach's page compares the last open with the newest
-- recording's commit time to say "updated since they opened it".
create table analysis_views (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses (id) on delete restrict,
  user_id uuid not null references users (id) on delete restrict,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, user_id)
);
create index analysis_views_user_id_idx on analysis_views (user_id);
create trigger analysis_views_updated_at before update on analysis_views for each row execute function set_updated_at();
