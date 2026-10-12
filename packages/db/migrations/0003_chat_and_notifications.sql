create table conversations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references users (id) on delete restrict,
  player_id uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, player_id),
  check (coach_id <> player_id)
);
create index conversations_player_id_idx on conversations (player_id);
create trigger conversations_updated_at before update on conversations for each row execute function set_updated_at();

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete restrict,
  sender_id uuid not null references users (id) on delete restrict,
  body text not null,
  video_id uuid references videos (id) on delete restrict,
  video_ms integer check (video_ms >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (video_ms is null or video_id is not null)
);
create index messages_conversation_id_created_at_idx on messages (conversation_id, created_at);
create trigger messages_updated_at before update on messages for each row execute function set_updated_at();

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_id_read_at_idx on notifications (user_id, read_at);
create trigger notifications_updated_at before update on notifications for each row execute function set_updated_at();
