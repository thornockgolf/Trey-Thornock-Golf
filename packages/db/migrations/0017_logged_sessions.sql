-- Logged sessions: practice a player did that is not on their plan (an extra day, or an early start on a planned
-- one). They are the same kind of thing as plan sessions (content tags, minutes, notes) but live in their own
-- table so they can never advance plan progress ("Lesson N of M", phases, drills done).
create table logged_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references users (id) on delete restrict,
  logged_on date not null, -- the player's local calendar date
  tags jsonb not null default '[]'::jsonb, -- subset of 'mechanical', 'skill', 'situational'
  minutes integer check (minutes is null or (minutes > 0 and minutes <= 600)),
  worked_on text,
  drills jsonb not null default '[]'::jsonb, -- [{ id, name }] picked from the drill library (snapshot)
  notes text,
  video_id uuid references videos (id) on delete restrict, -- optional swing video from this session
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index logged_sessions_player_id_logged_on_idx on logged_sessions (player_id, logged_on desc);
create index logged_sessions_video_id_idx on logged_sessions (video_id) where video_id is not null;
create trigger logged_sessions_updated_at before update on logged_sessions for each row execute function set_updated_at();

-- Planned sessions carry the same content tags, copied from the plan's session JSON when the plan is assigned.
alter table plan_sessions add column tags jsonb not null default '[]'::jsonb;
