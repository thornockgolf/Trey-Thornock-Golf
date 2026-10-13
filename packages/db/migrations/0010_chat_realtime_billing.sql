-- Part E: chat cursor and read pointers, notification lookups, Stripe customer mapping and payment
-- bookkeeping, and the Realtime channel policy (the only database-side authorization).

-- Chat ------------------------------------------------------------------------------------------
-- A monotonic cursor for catch-up after a reconnect (uuids are not ordered).
alter table messages add column seq bigint generated always as identity;
create unique index messages_seq_idx on messages (seq);
create index messages_conversation_id_seq_idx on messages (conversation_id, seq);
create index messages_sender_created_idx on messages (sender_id, created_at desc);
alter table messages add constraint messages_body_length check (char_length(body) between 1 and 4000);

-- Every active coaching relationship has a conversation (new ones are created when coaching starts).
insert into conversations (coach_id, player_id)
select coach_id, player_id from coach_assignments where status = 'active'
on conflict (coach_id, player_id) do nothing;

-- Each participant's read pointer: messages from the other side newer than this are unread.
alter table conversations add column coach_last_read_at timestamptz;
alter table conversations add column player_last_read_at timestamptz;

create index notifications_user_id_created_at_idx on notifications (user_id, created_at desc);

-- Billing ---------------------------------------------------------------------------------------
-- Created by the app when a player first starts Checkout; Stripe events carry the customer id.
create table stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users (id) on delete restrict,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger stripe_customers_updated_at before update on stripe_customers for each row execute function set_updated_at();

-- When status first became past_due (the grace period counts from here); cleared when it recovers.
alter table subscriptions add column past_due_since timestamptz;
alter table subscriptions add column cancel_at_period_end boolean not null default false;
-- Stripe does not deliver events in order: an older event never overwrites a newer one.
alter table subscriptions add column event_created_at timestamptz;

-- One-time payments (the assessment) have a payment intent and no invoice.
alter table payments add column kind text not null default 'membership' check (kind in ('assessment', 'membership'));
alter table payments add column stripe_payment_intent_id text unique;
alter table payments alter column stripe_invoice_id drop not null;
alter table payments add constraint payments_has_reference check (stripe_invoice_id is not null or stripe_payment_intent_id is not null);

-- Realtime ---------------------------------------------------------------------------------------
-- A client may only receive on the channel named in its short-lived token's `topic` claim
-- (`conversation:{id}` or `user:{id}`), minted by the app server after its own checks. Publishing
-- is done by the app server and worker with the service role, so there is no insert policy.
-- Idempotent: rerun `select app.install_realtime_policies()` if Realtime creates its schema after
-- this migration ran.
create or replace function install_realtime_policies() returns void language plpgsql as $fn$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages does not exist yet; policy not installed';
    return;
  end if;
  execute 'drop policy if exists ttg_channel_read on realtime.messages';
  execute $p$
    create policy ttg_channel_read on realtime.messages for select to authenticated
    using (realtime.topic() = (select auth.jwt() ->> 'topic'))
  $p$;
exception when insufficient_privilege then
  raise warning 'not allowed to change realtime.messages policies; install ttg_channel_read as the realtime owner';
end
$fn$;
select install_realtime_policies();
