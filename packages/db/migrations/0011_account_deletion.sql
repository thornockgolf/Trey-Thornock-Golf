-- Account deletion (coach-triggered). `deletion_requested_at` locks the account and hides the player from
-- the coach's list while the worker removes their files and rows. `deleted_at` marks the finished tombstone:
-- the users row stays (payments, subscriptions and stripe_customers keep a foreign key to it) with the
-- personal fields scrubbed.
alter table users add column deletion_requested_at timestamptz;
alter table users add column deleted_at timestamptz;
