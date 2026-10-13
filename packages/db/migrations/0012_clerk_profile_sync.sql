-- Name and email come from Clerk (synced by the app server on sign-in and about once a day after).
-- `profile_synced_at` says when. `display_name_locked` is set when the player typed their own name on
-- their profile, so the sync keeps their choice and only refreshes the email.
alter table users add column profile_synced_at timestamptz;
alter table users add column display_name_locked boolean not null default false;
