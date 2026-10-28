# Feedback tickets (temporary dev tool)

Added 2026-10-28. Outside Parts A-G of `docs/app_spec.md`. Lets the product owner (Trey) leave change requests from inside the running app while testing, on both the player and the coach side, and hand them to a coding agent as Markdown. Delete it before launch.

## How it works

- **Flag**: `PUBLIC_FEEDBACK_ENABLED` (`"true"` / `"false"`). Unset means **on in dev, off in production**. With the flag off there is no button, no sidebar link, `/feedback` is 404 and every `/api/feedback*` route answers 404. Read in `apps/app/src/lib/server/feedback-flag.ts` (`dev` from `$app/env`), so no `.env` change is needed for the dev server; the layout passes the result to the shell as `feedbackEnabled`.
- **Filing**: a floating button (44px circle on phones, pill with text from `md`) in the app shell opens a sheet: title (1-120), description (1-4000), type (Bug / Change / Idea), optional priority. The browser sends the current path with its query, viewport (`390x844`) and user agent; the server adds the author and their **role from the session** (never from the body). Text only; a screenshot upload would be a follow-up. On `/messages` the button sits at the top right so it does not cover the chat input. Phones have no sidebar, so the sheet links to "See all feedback".
- **Page** `/feedback` (sidebar link on both roles): filters by status and type; each ticket shows type, priority, status, role, page, viewport and age. The author edits title and description while the ticket is **open**. A coach changes the status (Open / In progress / Done / Won't do) and writes the "Agent notes / resolution" text. Players see only their own tickets (and the coach's status and notes on them); coaches see all.
- **Rules** (app server, `apps/app/src/lib/server/feedback.ts`): anonymous 401; someone else's ticket is 404 for a non-coach; `status` and `resolutionNotes` are coach-only (403); content edits are author-only and need status `open` (409 otherwise).

## Hand-off to an agent

- Coach page: **Export open tickets** copies the Markdown to the clipboard (downloads a `.md` when the clipboard is blocked); **Download .md** always downloads.
- `GET /api/feedback/export?status=open|in_progress|done|wont_do|all` (coach only, default `open`).
- `bun run feedback:export` prints the same text from the database (`-- --status all`).
- One formatter for all three: `formatFeedbackMarkdown` in `packages/shared/src/feedback.ts`. Each ticket is a section (`FB-<8 chars>: title`) with id, type, priority, status, page, role, viewport, filed time, user agent, the request and any notes. The ticket text is fenced so it reads as a request, not as instructions. High priority first, then oldest first.

## Files

| Area | Files |
|---|---|
| Migration | `packages/db/migrations/0016_feedback_tickets.sql` |
| Shared | `packages/shared/src/feedback.ts` (+ test), exported from `index.ts` |
| Database | `packages/db/src/feedback.ts` (+ test), `feedback-export.ts` (the script), export in `index.ts`; delete step in `accounts.ts` and a seed in `accounts.test.ts` |
| App server | `apps/app/src/lib/server/feedback.ts`, `feedback-flag.ts`, `feedback.db.test.ts`; `Feedback.layer` in `runtime.ts` |
| Routes | `apps/app/src/routes/api/feedback/**`, `routes/(app)/feedback/**`, `routes/dev/feedback/**`, `routes/dev/mock-api/feedback-store.ts` (+ one line in `mock-api/[...rest]/+server.ts`) |
| UI | `apps/app/src/lib/feedback/**` |
| Wiring | `AppShell.svelte` (`feedback` prop, button, nav item), `nav.ts` (`'feedback'` icon name), `NavIcon.svelte`, `(app)/+layout.server.ts` / `+layout.svelte`, `dev/shell/+page.svelte`, `env.ts`, root `package.json` (`feedback:export`), `.env.example`, `docs/deploy.md` |

## How to remove the feedback section

1. Add a **new** migration (`0017_drop_feedback_tickets.sql`: `drop table feedback_tickets;`). Never edit or delete `0016`; applied migrations are checksummed.
2. Delete the files in the table above, and the wiring: the `feedback` prop, button and nav item in `AppShell.svelte`, the `'feedback'` icon, `feedbackEnabled` in the `(app)` layout, the `feedback` attribute in `dev/shell`, `Feedback.layer` in `runtime.ts`, the exports in the two `index.ts` files, `PUBLIC_FEEDBACK_ENABLED` in `env.ts`, `.env.example` and `docs/deploy.md`, and the `feedback:export` script.
3. In `packages/db/src/accounts.ts` remove the `delete from feedback_tickets` line, and in `accounts.test.ts` the ticket seed and its two assertions. Do this in the same change as the drop migration, or account deletion breaks on the RESTRICT FK.
4. Remove this file and its rows in `docs/system/README.md`, `api-overview.md`, `database-schema.md`, and the note in `docs/app_spec.md`.
