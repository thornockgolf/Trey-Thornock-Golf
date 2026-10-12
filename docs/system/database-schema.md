# Database schema

Last updated: 2026-10-12 (`analysis_segments` re-read after migration 0006). Generated from the migrated local database (`packages/db/migrations`, applied versions below), not hand-written.

- Tables live in the `app` schema (not `public`). pg-boss keeps its own `pgboss` schema, created by pg-boss on start.
- Every table has `id uuid primary key default gen_random_uuid()`, `created_at` and `updated_at` (kept current by the `set_updated_at` trigger).
- Enum-like columns are `CHECK` constraints, not Postgres enums. Foreign keys are `RESTRICT`: deleting a referenced row is blocked until dependents are removed (the future account-deletion job).
- Authorization is not enforced in Postgres; the app server checks ownership and coach assignment (see `docs/system/api-overview.md`).

Applied migrations: `0001_users_and_coaching`, `0002_videos_and_analysis`, `0003_chat_and_notifications`, `0004_billing`, `0005_questionnaire_plans_calendar`, `0006_segment_operations`.

## `analyses`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `video_id` | uuid | no |  | videos (RESTRICT) |
| `coach_id` | uuid | no |  | users (RESTRICT) |
| `title` | text | yes |  |  |
| `overlay_settings` | jsonb | no | `'{}'` |  |

- Index: `CREATE INDEX analyses_coach_id_idx ON analyses (coach_id)`
- Index: `CREATE INDEX analyses_video_id_idx ON analyses (video_id)`

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

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `assessment_id` | uuid | no |  | assessments (RESTRICT) |
| `player_id` | uuid | no |  | users (RESTRICT) |
| `value` | numeric | no |  |  |
| `recorded_at` | timestamptz | no | `now()` |  |

- Index: `CREATE INDEX assessment_results_player_assessment_idx ON assessment_results (player_id, assessment_id, recorded_at DESC)`

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

- Check: `CHECK ((video_ms >= 0))`
- Check: `CHECK (((video_ms IS NULL) OR (video_id IS NOT NULL)))`
- Index: `CREATE INDEX messages_conversation_id_created_at_idx ON messages (conversation_id, created_at)`

## `notifications`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `type` | text | no |  |  |
| `payload` | jsonb | no | `'{}'` |  |
| `read_at` | timestamptz | yes |  |  |

- Index: `CREATE INDEX notifications_user_id_read_at_idx ON notifications (user_id, read_at)`

## `payments`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `stripe_invoice_id` | text | no |  |  |
| `amount_cents` | integer | no |  |  |
| `currency` | char(3) | no |  |  |
| `status` | text | no |  |  |
| `paid_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (stripe_invoice_id)`
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

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `assignment_id` | uuid | no |  | plan_assignments (RESTRICT) |
| `scheduled_on` | date | no |  |  |
| `duration_min` | integer | yes |  |  |
| `items` | jsonb | no | `'[]'` |  |
| `completed_at` | timestamptz | yes |  |  |

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

## `questionnaire_responses`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `version` | integer | no |  |  |
| `answers` | jsonb | no | `'{}'` |  |
| `completed_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (user_id, version)`
- Check: `CHECK ((version >= 1))`

## `stripe_events`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `event_id` | text | no |  |  |
| `type` | text | no |  |  |
| `processed_at` | timestamptz | yes |  |  |

- Unique: `UNIQUE (event_id)`

## `subscriptions`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `user_id` | uuid | no |  | users (RESTRICT) |
| `stripe_customer_id` | text | no |  |  |
| `stripe_subscription_id` | text | no |  |  |
| `price_id` | text | no |  |  |
| `status` | text | no |  |  |
| `current_period_end` | timestamptz | yes |  |  |

- Unique: `UNIQUE (stripe_subscription_id)`
- Index: `CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id)`

## `users`

| Column | Type | Null | Default | References |
|---|---|---|---|---|
| `clerk_user_id` | text | no |  |  |
| `role` | text | no | `'player'` |  |
| `display_name` | text | yes |  |  |
| `email` | text | yes |  |  |

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

