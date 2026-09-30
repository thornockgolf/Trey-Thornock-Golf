# Trey Thornock Golf

Static marketing site for Trey Thornock Golf, plus a standalone practice-plan tool. No build step, no API keys, no backend.

This repository is public on GitHub.

## Files

- `index.html` — main landing page ("PGA Golf Lessons in Durham, NC"). This is the Netlify site root.
- `golf-lessons-durham.html` — Durham lessons subpage, linked from `index.html`'s nav/footer/CTAs.
- `images/` — photos referenced by the pages above.
- `index-trey-website.html` — the Practice Plan Generator tool (diagnostic intake → timed practice plan with drills). Not linked from the main site; deployed separately as `treythornockgolfpractice.netlify.app`.

## Run locally

Open any of the `.html` files directly in a modern browser — each is self-contained.

## Deploy with Netlify

**Main site** (`treythornockgolf.com`): connect this repository to a Netlify site with no build command and publish directory `.`. Netlify serves `index.html` at the root automatically; `golf-lessons-durham.html` and `images/` are served alongside it.

**Practice planner** (`treythornockgolfpractice.netlify.app`): this is a separate Netlify site. To update it in place, deploy `index-trey-website.html` as that site's `index.html` (its own repo/source or direct Netlify project access is needed — this companion build has not been published there).

## Extend the practice-planner coaching framework

- Add diagnosis patterns and clarifying questions in the `rules` object.
- Keep rules based on observed ball flight/contact and use cautious likelihood language.
- Map recommended focus names to the existing movement, movement quality, and impact skill taxonomy.
- Add approved drills to the `drills` array with purpose, setup, steps, cues, success criteria, common mistake, progression, and regression.
- Keep API keys out of the browser. If a future AI layer is added, call it through a secured server-side function and validate its output against the coaching rules.

## Verify

From the workspace folder, run `node .\work\verify-current.js`. This checks multi-problem intake and diagnosis flows, player-facing plan content for the two- and four-problem examples, per-section issue labels, print and mobile stylesheet requirements, zero-problem intake, section-based plans, and exact totals for 30, 45, 60, and 90-minute sessions.
