# Database schema

Last updated: 2026-10-27 (`messages.read_at` after migration 0015; `conversations`, `messages`, `notifications`, `payments`, `subscriptions`, `stripe_customers` after migration 0010). Generated from the migrated local database (`packages/db/migrations`, applied versions below), not hand-written.

- Tables live in the `app` schema (not `public`). pg-boss keeps its own `pgboss` schema, created by pg-boss on start.
- Every table has `id uuid primary key default gen_random_uuid()`, `created_at` and `updated_at` (kept current by the `set_updated_at` trigger).
- Enum-like columns are `CHECK` constraints, not Postgres enums. Foreign keys are `RESTRICT`: deleting a referenced row is blocked until dependents are removed (the `account.delete` job removes them in order).
- Authorization is not enforced in Postgres; the app server checks ownership and coach assignment (see `docs/system/api-overview.md`).

Applied migrations: `0001_users_and_coaching`, `0002_videos_and_analysis`, `0003_chat_and_notifications`, `0004_billing`, `0005_questionnaire_plans_calendar`, `0006_segment_operations`, `0007_seed_drills` (the drill library from the legacy page), `0008_plan_session_title`, `0009_assessment_scheduling`, `0010_chat_realtime_billing`, `0011_account_deletion`, `0012_clerk_profile_sync`, `0013_push_subscriptions`, `0014_analysis_exports`, `0015_message_read_state`.

## `analyses`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `video_id` | uuid | no |  | videos (RESTRICT) |
| `coach_id` | uuid | no |  | users (RESTRICT) |
| `title` | text | yes |  |  |
| `overlay_settings` | jsonb | no | `'{}'` |  |

- Index: `CREATE INDEX analyses_coach_id_idx ON analyses (coach_id)`
- Index: `CREATE INDEX analyses_video_id_idx ON analyses (video_id)`

## `analysis_exports`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `analysis_id` | uuid | no |  | analyses (RESTRICT) |
| `status` | text | no |  |  |
| `output_key` | text | yes |  |  |
| `size_bytes` | bigint | yes |  |  |
| `error_code` | text | yes |  |  |
| `requested_at` | timestamptz | no | `now()` |  |
| `ready_at` | timestamptz | yes |  |  |

The flattened export of an analysis (`analysis.assemble`), one row per analysis. A new request keeps the previous `output_key` until the new file replaces it.

- Unique: `UNIQUE (analysis_id)`
- Check: `CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'ready'::text, 'failed'::text])))`

## `analysis_segments`

A coach's recording of one slot of the analysis timeline. A row can play a slice of its clip (`clip_start_ms`), so re-recording the middle of a take leaves trimmed pieces that still point at the same R2 objects. Every re-record is one operation named by the id of its new segment (`created_by` on the rows it made live, `replaced_by` on the rows it replaced); `created_by` and `replaced_by` are plain ids, not foreign keys, so the retention sweep can delete old rows. Positions are never reused. Live = `status = 'ready'` and `replaced_at is null`.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `analysis_id` | uuid | no |  | analyses (RESTRICT) |
| `position` | integer | no |  |  |
| `start_ms` | integer | no |  |  |
| `end_ms` | integer | no |  |  |
| `clip_key` | text | yes |  |  |
| `status` | text | no | `'pending'` |  |
| `replaced_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `source_key` | text | yes |  |  |
| `clip_start_ms` | integer | no | `0` |  |
| `has_video` | boolean | no | `false` |  |
| `error_code` | text | yes |  |  |
| `created_by` | uuid | yes |  |  |
| `replaced_by` | uuid | yes |  |  |
| `committed_at` | timestamptz | yes |  |  |
| `undone_at` | timestamptz | yes |  |  |
| `annotations_action` | text | no | `'keep'` |  |
| `removed_annotations` | jsonb | yes |  |  |

- Check: `CHECK ((annotations_action = ANY (ARRAY['keep'::text, 'remove'::text])))`
- Check: `CHECK ((clip_start_ms >= 0))`
- Check: `CHECK ((end_ms >= start_ms))`
- Check: `CHECK (("position" >= 0))`
- Check: `CHECK ((start_ms >= 0))`
- Check: `CHECK ((status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'processing'::text, 'ready'::text, 'failed'::text])))`
- Index: `CREATE INDEX analysis_segments_analysis_id_position_idx ON analysis_segments (analysis_id, "position")`
- Index: `CREATE INDEX analysis_segments_created_by_idx ON analysis_segments (created_by) WHERE (created_by IS NOT NULL)`
- Index: `CREATE INDEX analysis_segments_replaced_at_idx ON analysis_segments (replaced_at) WHERE (replaced_at IS NOT NULL)`
- Index: `CREATE INDEX analysis_segments_replaced_by_idx ON analysis_segments (replaced_by) WHERE (replaced_by IS NOT NULL)`
- Index: `CREATE UNIQUE INDEX analysis_segments_live_position_uq ON analysis_segments (analysis_id, "position") WHERE (replaced_at IS NULL)`

## `annotations`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `video_id` | uuid | yes |  | videos (RESTRICT) |
| `analysis_id` | uuid | yes |  | analyses (RESTRICT) |
| `author_id` | uuid | no |  | users (RESTRICT) |
| `start_ms` | integer | no |  |  |
| `end_ms` | integer | no |  |  |
| `shape` | jsonb | no |  |  |
| `version` | integer | no | `1` |  |

- Check: `CHECK ((end_ms >= start_ms))`
- Check: `CHECK ((start_ms >= 0))`
- Check: `CHECK (((video_id IS NOT NULL) <> (analysis_id IS NOT NULL)))`
- Index: `CREATE INDEX annotations_analysis_id_start_ms_idx ON annotations (analysis_id, start_ms) WHERE (analysis_id IS NOT NULL)`
- Index: `CREATE INDEX annotations_video_id_start_ms_idx ON annotations (video_id, start_ms) WHERE (video_id IS NOT NULL)`

## `assessment_results`

A row with `scheduled_on` and no `value` is a test scheduled for the player; recording the result fills `value` and `recorded_at`. A row with a value and no schedule is an ad-hoc result. The calendar day of a row is `coalesce(scheduled_on, recorded_at::date)`.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `assessment_id` | uuid | no |  | assessments (RESTRICT) |
| `player_id` | uuid | no |  | users (RESTRICT) |
| `value` | numeric | yes |  |  |
| `recorded_at` | timestamptz | no | `now()` |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `scheduled_on` | date | yes |  |  |

- Check: `CHECK (((value IS NOT NULL) OR (scheduled_on IS NOT NULL)))`
- Index: `CREATE INDEX assessment_results_player_assessment_idx ON assessment_results (player_id, assessment_id, recorded_at DESC)`
- Index: `CREATE INDEX assessment_results_scheduled_on_idx ON assessment_results (player_id, scheduled_on) WHERE (scheduled_on IS NOT NULL)`

## `assessments`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `name` | text | no |  |  |
| `description` | text | yes |  |  |
| `unit` | text | yes |  |  |

- Unique: `UNIQUE (name)`

## `check_ins`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `player_id` | uuid | no |  | users (RESTRICT) |
| `scheduled_on` | date | no |  |  |
| `answers` | jsonb | no | `'{}'` |  |
| `submitted_at` | timestamptz | yes |  |  |

- Index: `CREATE INDEX check_ins_player_id_scheduled_on_idx ON check_ins (player_id, scheduled_on)`

## `coach_assignments`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `coach_id` | uuid | no |  | users (RESTRICT) |
| `player_id` | uuid | no |  | users (RESTRICT) |
| `status` | text | no | `'active'` |  |

- Unique: `UNIQUE (coach_id, player_id)`
- Check: `CHECK ((coach_id <> player_id))`
- Check: `CHECK ((status = ANY (ARRAY['active'::text, 'ended'::text])))`
- Index: `CREATE INDEX coach_assignments_player_id_idx ON coach_assignments (player_id)`

## `coach_notes`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `assignment_id` | uuid | no |  | coach_assignments (RESTRICT) |
| `body` | text | no |  |  |

- Index: `CREATE INDEX coach_notes_assignment_id_idx ON coach_notes (assignment_id, created_at DESC)`

## `conversations`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `coach_id` | uuid | no |  | users (RESTRICT) |
| `player_id` | uuid | no |  | users (RESTRICT) |
| `coach_last_read_at` | timestamptz | yes |  |  |
| `player_last_read_at` | timestamptz | yes |  |  |

One per coach-player pair, created when coaching starts (`startCoaching`) and backfilled for existing active assignments. The read pointers are legacy: since migration 0015 unread is per message (`messages.read_at`) and nothing reads or writes them.

- Unique: `UNIQUE (coach_id, player_id)`
- Check: `CHECK ((coach_id <> player_id))`
- Index: `CREATE INDEX conversations_player_id_idx ON conversations (player_id)`

## `drills`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `name` | text | no |  |  |
| `category` | text | yes |  |  |
| `purpose` | text | yes |  |  |
| `setup` | text | yes |  |  |
| `steps` | jsonb | no | `'[]'` |  |
| `cues` | text | yes |  |  |
| `success_criteria` | text | yes |  |  |
| `common_mistake` | text | yes |  |  |
| `progression` | text | yes |  |  |
| `regression` | text | yes |  |  |

- Unique: `UNIQUE (name)`

## `messages`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `conversation_id` | uuid | no |  | conversations (RESTRICT) |
| `sender_id` | uuid | no |  | users (RESTRICT) |
| `body` | text | no |  |  |
| `video_id` | uuid | yes |  | videos (RESTRICT) |
| `video_ms` | integer | yes |  |  |
| `seq` | bigint | no | identity |  |
| `read_at` | timestamptz | yes |  |  |

`read_at` is when the recipient read it (null while unread; the sender's own messages stay null and are never counted). A message belongs to the thread of its `video_id`; no `video_id` means the general thread (the Messages tab).

- Check: `CHECK ((char_length(body) BETWEEN 1 AND 4000))`
- Unique index: `messages_seq_idx (seq)`: the cursor for catch-up (`?after=seq`); uuids are not ordered
- Index: `messages_conversation_id_seq_idx (conversation_id, seq)`, `messages_sender_created_idx (sender_id, created_at DESC)` (the 30 per minute limit)
- Check: `CHECK ((video_ms >= 0))`
- Check: `CHECK (((video_ms IS NULL) OR (video_id IS NOT NULL)))`
- Index: `CREATE INDEX messages_conversation_id_created_at_idx ON messages (conversation_id, created_at)`, `messages_unread_idx (conversation_id, sender_id) WHERE read_at IS NULL`

## `notifications`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `type` | text | no |  |  |
| `payload` | jsonb | no | `'{}'` |  |
| `read_at` | timestamptz | yes |  |  |

- Index: `CREATE INDEX notifications_user_id_read_at_idx ON notifications (user_id, read_at)`, `notifications_user_id_created_at_idx (user_id, created_at DESC)`
- Types written today: `message` (one unread row per thread: the general one, or one per video with `payload.videoId`; `payload.count` rising), `video_ready`, `video_failed`, `analysis_ready`, `plan_assigned`, `check_in_scheduled`, `check_in_submitted`, `assessment_result`, `payment_issue`, `coach_assigned`, `new_player`.

## `payments`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `stripe_invoice_id` | text | yes |  |  |
| `amount_cents` | integer | no |  |  |
| `currency` | char(3) | no |  |  |
| `status` | text | no |  |  |
| `paid_at` | timestamptz | yes |  |  |
| `kind` | text | no | `'membership'` |  |
| `stripe_payment_intent_id` | text | yes |  |  |

- Unique: `UNIQUE (stripe_invoice_id)`, `UNIQUE (stripe_payment_intent_id)`
- Check: `kind IN ('assessment', 'membership')`; one of invoice id or payment intent id is present. The one-time assessment has a payment intent and no invoice.
- Check: `CHECK ((amount_cents >= 0))`
- Index: `CREATE INDEX payments_user_id_idx ON payments (user_id, created_at DESC)`

## `plan_assignments`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `plan_id` | uuid | no |  | practice_plans (RESTRICT) |
| `player_id` | uuid | no |  | users (RESTRICT) |
| `starts_on` | date | no |  |  |
| `status` | text | no | `'active'` |  |

- Check: `CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))`
- Index: `CREATE INDEX plan_assignments_player_id_idx ON plan_assignments (player_id)`

## `plan_sessions`

`title` is the plan session's title, copied when the plan is assigned. Each item in `items` is `{ id, drillId, name, minutes, completedAt }`; the drill name is copied so later drill edits do not change what the player was given.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` |  |
| `assignment_id` | uuid | no |  | plan_assignments (RESTRICT) |
| `scheduled_on` | date | no |  |  |
| `duration_min` | integer | yes |  |  |
| `items` | jsonb | no | `'[]'` |  |
| `completed_at` | timestamptz | yes |  |  |
| `created_at` | timestamptz | no | `now()` |  |
| `updated_at` | timestamptz | no | `now()` |  |
| `title` | text | yes |  |  |

- Check: `CHECK ((duration_min > 0))`
- Index: `CREATE INDEX plan_sessions_assignment_id_scheduled_on_idx ON plan_sessions (assignment_id, scheduled_on)`

## `player_profiles`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `handicap` | numeric(4,1) | yes |  |  |
| `goals` | text | yes |  |  |
| `home_course` | text | yes |  |  |
| `hand` | text | yes |  |  |
| `equipment` | text | yes |  |  |
| `limitations` | text | yes |  |  |
| `photo_key` | text | yes |  |  |

- Unique: `UNIQUE (user_id)`
- Check: `CHECK ((hand = ANY (ARRAY['left'::text, 'right'::text])))`

## `practice_plans`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `author_id` | uuid | no |  | users (RESTRICT) |
| `title` | text | no |  |  |
| `structure` | jsonb | no | `'{}'` |  |

- Index: `CREATE INDEX practice_plans_author_id_idx ON practice_plans (author_id)`

## `push_subscriptions`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `endpoint` | text | no |  |  |
| `p256dh` | text | no |  |  |
| `auth` | text | no |  |  |

One row per browser a user turned web push on in. `endpoint` is the push service URL; `p256dh` and `auth` encrypt the payload for that browser.

- Unique: `UNIQUE (endpoint)`
- Index: `CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id)`

## `questionnaire_responses`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `version` | integer | no |  |  |
| `answers` | jsonb | no | `'{}'` |  |
| `completed_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (user_id, version)`
- Check: `CHECK ((version >= 1))`

## `stripe_customers`

Written by the app when a player first starts Checkout; Stripe events carry the customer id, which is how they are matched to a user.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT), unique |
| `stripe_customer_id` | text | no |  | unique |

## `stripe_events`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `event_id` | text | no |  |  |
| `type` | text | no |  |  |
| `processed_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (event_id)`

## `subscriptions`

`past_due_since` starts the 7 day grace period; `event_created_at` keeps an older Stripe event from overwriting a newer one.

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `stripe_customer_id` | text | no |  |  |
| `stripe_subscription_id` | text | no |  |  |
| `price_id` | text | no |  |  |
| `status` | text | no |  |  |
| `current_period_end` | timestamptz | yes |  |  |
| `past_due_since` | timestamptz | yes |  |  |
| `cancel_at_period_end` | boolean | no | `false` |  |
| `event_created_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (stripe_subscription_id)`
- Index: `CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id)`

## `users`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `clerk_user_id` | text | no |  |  |
| `role` | text | no | `'player'` |  |
| `display_name` | text | yes |  |  |
| `email` | text | yes |  |  |
| `deletion_requested_at` | timestamptz | yes |  |  |
| `deleted_at` | timestamptz | yes |  |  |
| `profile_synced_at` | timestamptz | yes |  |  |
| `display_name_locked` | boolean | no | `false` |  |

`deletion_requested_at` locks the account while the `account.delete` job runs; `deleted_at` marks the finished tombstone (personal fields scrubbed, `clerk_user_id` = `deleted:<id>`), kept because payments, subscriptions and `stripe_customers` reference it. `display_name` and `email` are filled from Clerk (`profile_synced_at` is the last sync); `display_name_locked` is set when the player typed their own name, so the sync leaves it alone.

- Unique: `UNIQUE (clerk_user_id)`
- Check: `CHECK ((role = ANY (ARRAY['player'::text, 'coach'::text])))`

## `videos`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `owner_id` | uuid | no |  | users (RESTRICT) |
| `kind` | text | no |  |  |
| `status` | text | no | `'pending'` |  |
| `title` | text | yes |  |  |
| `source_key` | text | yes |  |  |
| `processed_key` | text | yes |  |  |
| `thumbnail_key` | text | yes |  |  |
| `sprite_key` | text | yes |  |  |
| `duration_ms` | integer | yes |  |  |
| `fps` | numeric(6,3) | yes |  |  |
| `width` | integer | yes |  |  |
| `height` | integer | yes |  |  |
| `error_code` | text | yes |  |  |
| `size_bytes` | bigint | yes |  |  |

- Check: `CHECK ((duration_ms >= 0))`
- Check: `CHECK ((fps > (0)::numeric))`
- Check: `CHECK ((height > 0))`
- Check: `CHECK ((kind = ANY (ARRAY['swing'::text, 'reference'::text, 'analysis_source'::text])))`
- Check: `CHECK ((size_bytes >= 0))`
- Check: `CHECK ((status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'processing'::text, 'ready'::text, 'failed'::text])))`
- Check: `CHECK ((width > 0))`
- Index: `CREATE INDEX videos_owner_id_created_at_idx ON videos (owner_id, created_at DESC)`

