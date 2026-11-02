-- Fuzzy search for the coach's global search bar: pg_trgm (typo-tolerant word similarity and fast ILIKE) with GIN
-- trigram indexes on the text the search reads. pg_trgm ships with Postgres contrib and is a "trusted" extension (PG 13+),
-- so the database owner (the `postgres` role of the self-hosted Supabase image) can create it without superuser rights.
-- Supabase's dashboard installs extensions into the `extensions` schema; if pg_trgm is already there this is a no-op,
-- so the operator class is looked up in both places, and the Search service sets the same search_path at query time.
set local search_path = app, public, extensions;

create extension if not exists pg_trgm with schema public;

create index users_display_name_trgm_idx on users using gin (display_name gin_trgm_ops) where role = 'player';
create index users_email_trgm_idx on users using gin (email gin_trgm_ops) where role = 'player';
create index videos_title_trgm_idx on videos using gin (title gin_trgm_ops) where title is not null;
create index messages_body_trgm_idx on messages using gin (body gin_trgm_ops);
create index coach_notes_body_trgm_idx on coach_notes using gin (body gin_trgm_ops);
create index practice_plans_title_trgm_idx on practice_plans using gin (title gin_trgm_ops);
create index drills_name_trgm_idx on drills using gin (name gin_trgm_ops);
