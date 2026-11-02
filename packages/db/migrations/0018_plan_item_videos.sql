-- A player may attach one of their videos to a drill in a plan session, to show Trey they know the exercise. It is
-- optional and never gates checking a drill off. Items live inside plan_sessions.items (jsonb), so the link is a
-- small table keyed by (session, item id); the item id is the uuid inside the JSON, so it has no foreign key.
-- Removing the attachment deletes only this row; the video stays in the player's library.
create table plan_item_videos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references plan_sessions (id) on delete restrict,
  item_id uuid not null,
  video_id uuid not null references videos (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, item_id)
);
create index plan_item_videos_video_id_idx on plan_item_videos (video_id);
create trigger plan_item_videos_updated_at before update on plan_item_videos for each row execute function set_updated_at();
