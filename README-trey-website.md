# Trey Thornock Golf Diagnostic + Practice Planner

## Run locally

Open `index.html` in a modern browser. The app is a single-file, no-build static site and has no API keys or backend dependencies. The player's free-text intake is extracted into independent problem records before diagnosis; the interface shows every concern with a plain-language status, and the plan names the concern each section addresses. Each record retains its source text, club, symptom, answers, focus, confidence, and priority. The plan uses timed practice sections, with relevant drills and all section durations adding up to the selected session length. On phones, sections use large time badges, expandable drill instructions, and a sticky current-section indicator. Print styles provide a compact, high-contrast paper/PDF layout with instructions expanded.

## Deploy with Netlify

Use this folder as the static site root in a Netlify site, or place `index.html` at the root of the connected GitHub repository and deploy that repository. To update the currently published `treythornockgolfpractice.netlify.app` site in place, the original GitHub repository/source or Netlify project access is needed; this companion build has not been published.

## Extend the coaching framework

- Add diagnosis patterns and clarifying questions in the `rules` object.
- Keep rules based on observed ball flight/contact and use cautious likelihood language.
- Map recommended focus names to the existing movement, movement quality, and impact skill taxonomy.
- Add approved drills to the `drills` array with purpose, setup, steps, cues, success criteria, common mistake, progression, and regression.
- Keep API keys out of the browser. If a future AI layer is added, call it through a secured server-side function and validate its output against the coaching rules.

## Verify

From the workspace folder, run `node .\work\verify-current.js`. This checks multi-problem intake and diagnosis flows, player-facing plan content for the two- and four-problem examples, per-section issue labels, print and mobile stylesheet requirements, zero-problem intake, section-based plans, and exact totals for 30, 45, 60, and 90-minute sessions.
