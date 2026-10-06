---
name: enhance-user-prompt
description: Turns a rough idea for the Trey Thornock Golf platform into a clear task description grounded in roadmap.md and the fixed stack. Use when a request is vague (e.g. "add the compare thing") and needs scope, roles, and edge cases before work starts.
allowed-tools: Read, Grep
user-invocable: true
---

# Enhance User Prompt — Trey Thornock Golf

Take a rough description and turn it into a clear, actionable task for this project. First skim `roadmap.md` (and `ARCHITECTURE.md` if the idea touches infrastructure) so the result uses the project's real terms and decisions.

## 1. Analyze
- Core intent; which roadmap item(s) it maps to (cite numbers).
- Which product it belongs to: marketing site (Netlify), intake-to-practice-plan service, or one-on-one coaching service.
- Who uses it: Player, Coach (Trey), or visitor.

## 2. Clarify scope
- Boundaries: what is in and out. Anything in "Post-MVP" (pose estimation) is out.
- Implicit requirements from decisions already made: annotations stored as JSON with timestamps, source videos kept, uploads direct to R2 via presigned URLs, heavy work via pg-boss, payment state from Stripe webhooks, Clerk-scoped data, PWA-friendly UI.
- Do not reopen decided technology (SvelteKit, Clerk, Supabase Postgres/Realtime, R2, video.js, Fabric.js, Uppy, ffmpeg, pg-boss, Stripe).

## 3. Structure
- Clear title, short description, sub-tasks where useful.

## 4. Enhance
- Measurable outcomes, edge cases (permission denied, upload fails or is interrupted on mobile, video still processing, unpaid user), dependencies (e.g. needs Clerk + schema first), and a role for each action.

## Output
Output ONLY the improved task description. No explanations, no meta-commentary.
