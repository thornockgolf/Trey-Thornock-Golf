-- Flattened export of an analysis (video + annotations + the coach's commentary in one MP4), made by the
-- `analysis.assemble` worker job on request. One row per analysis; asking again re-queues it.
create table analysis_exports (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null unique references analyses (id) on delete restrict,
  status text not null check (status in ('queued', 'processing', 'ready', 'failed')),
  output_key text,
  size_bytes bigint,
  error_code text,
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger analysis_exports_updated_at before update on analysis_exports for each row execute function set_updated_at();
