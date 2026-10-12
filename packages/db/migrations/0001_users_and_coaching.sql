-- Users, player profiles, coach assignments and coach notes (spec section 4).
-- Conventions for every table: uuid id, created_at, updated_at (kept current by a trigger).
-- Tables live in the `app` schema (the runner sets search_path), not `public`, because Supabase's
-- REST layer exposes `public`. Enums are CHECK constraints so they can change in forward-only
-- migrations. Foreign keys are RESTRICT: deleting a user is blocked until dependents are removed
-- by the account-deletion job.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  role text not null default 'player' check (role in ('player', 'coach')),
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_updated_at before update on users for each row execute function set_updated_at();

create table player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete restrict,
  handicap numeric(4, 1),
  goals text,
  home_course text,
  hand text check (hand in ('left', 'right')),
  equipment text,
  limitations text,
  photo_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger player_profiles_updated_at before update on player_profiles for each row execute function set_updated_at();

create table coach_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references users (id) on delete restrict,
  player_id uuid not null references users (id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, player_id),
  check (coach_id <> player_id)
);
create index coach_assignments_player_id_idx on coach_assignments (player_id);
create trigger coach_assignments_updated_at before update on coach_assignments for each row execute function set_updated_at();

-- Never returned to players: enforced in the app server, not here.
create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references coach_assignments (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index coach_notes_assignment_id_idx on coach_notes (assignment_id, created_at desc);
create trigger coach_notes_updated_at before update on coach_notes for each row execute function set_updated_at();
