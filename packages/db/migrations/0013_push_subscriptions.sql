-- Web push subscriptions: one row per browser the user turned notifications on in. `endpoint` is the push
-- service URL the server POSTs to; `p256dh` and `auth` are the keys that encrypt the payload for that browser.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on push_subscriptions (user_id);
create trigger push_subscriptions_updated_at before update on push_subscriptions for each row execute function set_updated_at();
