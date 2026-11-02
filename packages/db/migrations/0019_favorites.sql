-- A player's favourites: sessions of their own plan and drills they have been given. A session favourite points at a
-- plan_sessions row; a drill favourite points at the drill itself (the same drill can appear in many sessions, and the
-- star means "this drill"). Exactly one target per row, and one row per (player, target).
create table favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  kind text not null check (kind in ('session', 'drill')),
  session_id uuid references plan_sessions (id) on delete restrict,
  drill_id uuid references drills (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'session' and session_id is not null and drill_id is null)
    or (kind = 'drill' and drill_id is not null and session_id is null)
  )
);
create unique index favorites_user_session_idx on favorites (user_id, session_id) where session_id is not null;
create unique index favorites_user_drill_idx on favorites (user_id, drill_id) where drill_id is not null;
create index favorites_session_id_idx on favorites (session_id) where session_id is not null;
create index favorites_drill_id_idx on favorites (drill_id) where drill_id is not null;
create trigger favorites_updated_at before update on favorites for each row execute function set_updated_at();
