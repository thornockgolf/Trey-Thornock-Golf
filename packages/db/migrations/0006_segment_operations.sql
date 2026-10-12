-- Partial re-record (spec 3.D.3). A segment row can play a slice of a clip (`clip_start_ms`), so re-recording the
-- middle of a take splits the old row into two trimmed rows that still point at the same R2 object: the parts
-- outside the re-recorded range keep their objects unchanged.
--
-- Every re-record is one operation, named by the id of the new segment (`created_by` on the rows it made live,
-- `replaced_by` on the rows it replaced). Undo reverses the latest operation, and replaced rows stay for 30 days.
-- `created_by` and `replaced_by` are plain ids, not foreign keys: the retention sweep deletes old rows freely.

alter table analysis_segments
  add column source_key text,                                   -- the raw recording (kept with the segment)
  add column clip_start_ms integer not null default 0 check (clip_start_ms >= 0),
  add column has_video boolean not null default false,         -- false: audio only
  add column error_code text,
  add column created_by uuid,
  add column replaced_by uuid,
  add column committed_at timestamptz,                          -- when the new segment went live (operation time)
  add column undone_at timestamptz,
  add column annotations_action text not null default 'keep' check (annotations_action in ('keep', 'remove')),
  add column removed_annotations jsonb;                         -- annotations deleted by this operation, for undo

create index analysis_segments_created_by_idx on analysis_segments (created_by) where created_by is not null;
create index analysis_segments_replaced_by_idx on analysis_segments (replaced_by) where replaced_by is not null;
