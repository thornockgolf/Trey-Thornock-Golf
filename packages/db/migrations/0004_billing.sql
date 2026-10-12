-- Payment state is written only by the Stripe webhook handler (never by the browser).

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  price_id text not null,
  status text not null,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on subscriptions (user_id);
create trigger subscriptions_updated_at before update on subscriptions for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete restrict,
  stripe_invoice_id text not null unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null,
  status text not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_user_id_idx on payments (user_id, created_at desc);
create trigger payments_updated_at before update on payments for each row execute function set_updated_at();

-- Idempotency: an event is handled once; processed_at is set when handling finishes.
create table stripe_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stripe_events_updated_at before update on stripe_events for each row execute function set_updated_at();
