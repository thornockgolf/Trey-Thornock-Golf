-- TEMPORARY dev tool: in-app feedback tickets, so the product owner can leave change requests while testing.
-- To remove the feature, add a new migration that drops this table (never edit this file); see docs/system/feedback.md.
create table feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references users (id) on delete restrict,
  author_role text not null check (author_role in ('player', 'coach')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  type text not null check (type in ('bug', 'change', 'idea')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'wont_do')),
  -- Captured by the browser when the ticket is filed.
  page_path text not null default '' check (char_length(page_path) <= 1000),
  viewport text not null default '' check (char_length(viewport) <= 40),
  user_agent text not null default '' check (char_length(user_agent) <= 1000),
  -- Coach-only: what was done, or why not.
  resolution_notes text check (resolution_notes is null or char_length(resolution_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_tickets_author_id_idx on feedback_tickets (author_id);
create index feedback_tickets_status_idx on feedback_tickets (status, created_at);
create trigger feedback_tickets_updated_at before update on feedback_tickets for each row execute function set_updated_at();
