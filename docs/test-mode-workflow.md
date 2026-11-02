# Test-mode workflow (fix requests handled by background subagents)

How Ted and Claude work while testing the app on a real phone and desktop. Copy the **Starter prompt** below into a new Claude Code thread to continue the same way (for example for the coach side: change "player" to "coach").

## Starter prompt (copy from here)

```
We are in test mode for the COACH side of the app (use "player" instead when testing the player side). I will send short "fix" descriptions, often with a desktop screenshot. For each one:

1. You are the planner. Read CLAUDE.md, the relevant docs/system/ notes and the code you need, then decide what to do. If the request is ambiguous, ask me with the question tool (AskUserQuestion) BEFORE delegating. Offer 2-4 concrete options and put your recommendation first. Do not ask about things with an obvious default; pick it and tell me.
2. Do the work through background subagents (Agent tool, run_in_background: true), not inline. Give each agent a self-contained brief: route, file hints, what desktop and phone should look like, the decisions already made with me, and the repo rules from CLAUDE.md. Independent tasks run as separate agents in parallel; do not give two agents the same files.
3. Every brief must include:
   - "If anything is unclear, send the question to the main session with SendMessage to "main" instead of guessing." You then ask me and relay my answer.
   - "Verify the change at BOTH phone (390 px) and desktop (1280 px) widths, glance at 768 px, in light and dark mode, and report each."
   - Start its own dev server on a free port with `bun --bun vite dev --port N`, stop it by port afterwards, never `pkill -f`, never touch the systemd `ttg-app` service on 5173.
   - It cannot sign in as me; never mint sign-in tokens or impersonate. Use the /dev/* preview routes with mock APIs for browser checks.
   - Tests added for new logic (pure functions, DOM tests, DB/handler tests), then `bun run check` and the app/shared/db tests pass.
   - Update the relevant docs (docs/system/*, spec "As built" note, work_plan); never edit docs/roadmap.md.
   - Do not commit or push.
   - The final report says exactly what was verified at which widths and what could NOT be verified (real phone, real signed-in session, real Stripe/R2).
4. While agents run, tell me briefly what was launched. When one finishes, report in plain language: what I will see, what was checked, what was not, any change I did not ask for, and whether the dev server needs a restart.
5. If packages/shared changed, or a new API route was added, restart the dev server (`systemctl --user restart ttg-app`) and check /healthz returns 200. A 500 right after a change is usually a stale @ttg/shared copy.
6. Commit or push ONLY when I ask. Never push main. Commits end with the Co-Authored-By line required by the session.
```

## Roles

- **Ted**: tests on a phone (through the ngrok URL) and desktop, sends screenshots, console errors and short requests. Answers the clarifying questions.
- **Main session (Claude)**: clarifies, writes briefs, launches agents, relays questions, restarts the dev server, reports results, commits when asked.
- **Subagents**: implement, test and verify one task each, report honestly.

## Dev environment

- Dev server is the systemd user service `ttg-app` (port 5173, `bun run dev:app`), reached through ngrok `https://marginally-precious-osprey.ngrok-free.app`.
  - Restart: `systemctl --user restart ttg-app`. Logs: `journalctl --user -u ttg-app -n 40 --no-pager`.
  - Needed after `packages/shared` changes (stale copy gives 500 with "does not provide an export named ...") and for new API routes.
- Agents use their own ports (`bun --bun vite dev --port N`; plain `bunx vite dev` without `--bun` returns 500).
- Preview routes with mock APIs live under `/dev/*` (for example `/dev/calendar`, `/dev/billing`, `/dev/player-plans`, `/dev/feedback`, `/dev/access`, `/dev/clerk-profile`).
- Real-device problems we hit before: R2 CORS must allow the ngrok origin; a phone that cannot reach ngrok is a network/VPN/DNS issue; `bind:value` on `<input type="number">` gives a number, not a string.

## How Ted reports problems (and what works best)

- A desktop screenshot plus one or two sentences.
- For "nothing happens" bugs: hard refresh, open the browser console, press the button, and paste the red error. That found the `text.trim is not a function` bug immediately.
- Phone-only issues: say it is the phone and which browser.

## Standing decisions

- Clarify first, delegate second. UI work goes to a subagent.
- Everything must work at phone and desktop widths and in dark mode.
- Tokens from `docs/style-guide.md`, not raw hex. Skeleton components first.
- Payment state is only written by the Stripe webhook. Authorization lives in the app server (`requireRole`).
- Nothing is committed or pushed unless Ted asks. `main` is never pushed.

## Done so far in this workflow (player side)

Phone avatar menu and nav, play button and speed picker, muted original audio, independent compare, month-only calendar with logging of practice sessions and check-ins, per-drill video, profile photo, cancel and resume membership, plans with History and favorites, auth screens and Clerk Manage account styling, feedback done and delete. Committed on `video-analysis` (`d0008df`).

## Still open

- Nothing in this list has been tried on a real phone with a real signed-in session, a real Stripe webhook (none registered), or a real microphone.
- Upgrade and downgrade membership (only one tier exists, so not built).
- Star on the single-session page (`/plans/sessions/:id`).
- Real-window check of Clerk's Manage account styling (needs Ted's screenshot).
- Whether to add a payment gate to compare.
- Next planned focus: test the coach side (dashboard, player page and notes, plan composer, library, analysis recorder).
