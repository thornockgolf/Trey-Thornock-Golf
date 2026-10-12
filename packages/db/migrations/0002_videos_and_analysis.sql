-- Videos, coach analyses, replaceable segments and annotations. Video bytes live in R2; these
-- tables hold keys and metadata only. Annotations are JSON in Postgres, never burned into video.
-- All times are integer milliseconds from the start of the processed timeline.

create table videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users (id) on delete restrict,
  kind text not null check (kind in ('swing', 'reference', 'analysis_source')),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'processing', 'ready', 'failed')),
  title text,
  source_key text, -- raw/{video_id}/source.{ext}; never deleted
  processed_key text,
  thumbnail_key text,
  sprite_key text,
  duration_ms integer check (duration_ms >= 0),
  fps numeric(6, 3) check (fps > 0),
  width integer check (width > 0),
  height integer check (height > 0),
  error_code text,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_owner_id_created_at_idx on videos (owner_id, created_at desc);
create trigger videos_updated_at before update on videos for each row execute function set_updated_at();

create table analyses (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos (id) on delete restrict,
  coach_id uuid not null references users (id) on delete restrict,
  title text,
  overlay_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analyses_video_id_idx on analyses (video_id);
create index analyses_coach_id_idx on analyses (coach_id);
create trigger analyses_updated_at before update on analyses for each row execute function set_updated_at();

-- Replaced segments are kept for 30 days (retention sweep), so a position can have several rows;
-- only one row per position may be live (replaced_at is null).
create table analysis_segments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses (id) on delete restrict,
  position integer not null check (position >= 0),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  clip_key text,
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'processing', 'ready', 'failed')),
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_ms >= start_ms)
);
create index analysis_segments_analysis_id_position_idx on analysis_segments (analysis_id, position);
create unique index analysis_segments_live_position_uq on analysis_segments (analysis_id, position) where replaced_at is null;
create index analysis_segments_replaced_at_idx on analysis_segments (replaced_at) where replaced_at is not null;
create trigger analysis_segments_updated_at before update on analysis_segments for each row execute function set_updated_at();

-- Belongs to a video or to an analysis, never both.
create table annotations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos (id) on delete restrict,
  analysis_id uuid references analyses (id) on delete restrict,
  author_id uuid not null references users (id) on delete restrict,
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null,
  shape jsonb not null, -- normalized coordinates
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((video_id is not null) <> (analysis_id is not null)),
  check (end_ms >= start_ms)
);
create index annotations_video_id_start_ms_idx on annotations (video_id, start_ms) where video_id is not null;
create index annotations_analysis_id_start_ms_idx on annotations (analysis_id, start_ms) where analysis_id is not null;
create trigger annotations_updated_at before update on annotations for each row execute function set_updated_at();
