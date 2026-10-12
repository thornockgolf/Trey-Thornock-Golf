create table questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  version integer not null check (version >= 1),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz, -- null while a draft
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);
create trigger questionnaire_responses_updated_at before update on questionnaire_responses for each row execute function set_updated_at();

create table drills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  purpose text,
  setup text,
  steps jsonb not null default '[]'::jsonb,
  cues text,
  success_criteria text,
  common_mistake text,
  progression text,
  regression text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger drills_updated_at before update on drills for each row execute function set_updated_at();

create table practice_plans (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users (id) on delete restrict,
  title text not null,
  structure jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practice_plans_author_id_idx on practice_plans (author_id);
create trigger practice_plans_updated_at before update on practice_plans for each row execute function set_updated_at();

create table plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references practice_plans (id) on delete restrict,
  player_id uuid not null references users (id) on delete restrict,
  starts_on date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_assignments_player_id_idx on plan_assignments (player_id);
create trigger plan_assignments_updated_at before update on plan_assignments for each row execute function set_updated_at();

-- Item-level completion lives in `items`.
create table plan_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references plan_assignments (id) on delete restrict,
  scheduled_on date not null,
  duration_min integer check (duration_min > 0),
  items jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_sessions_assignment_id_scheduled_on_idx on plan_sessions (assignment_id, scheduled_on);
create trigger plan_sessions_updated_at before update on plan_sessions for each row execute function set_updated_at();

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references users (id) on delete restrict,
  scheduled_on date not null,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index check_ins_player_id_scheduled_on_idx on check_ins (player_id, scheduled_on);
create trigger check_ins_updated_at before update on check_ins for each row execute function set_updated_at();

-- Test definitions, and a player's results over time (trend).
create table assessments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger assessments_updated_at before update on assessments for each row execute function set_updated_at();

create table assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete restrict,
  player_id uuid not null references users (id) on delete restrict,
  value numeric not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessment_results_player_assessment_idx on assessment_results (player_id, assessment_id, recorded_at desc);
create trigger assessment_results_updated_at before update on assessment_results for each row execute function set_updated_at();
