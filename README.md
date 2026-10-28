# Trey Thornock Golf

Marketing site and golf video-analysis and coaching app for Trey Thornock, PGA coach in Durham, NC (`treythornockgolf.com`). A Bun-workspaces monorepo. The marketing site is ported and the app foundation is built; the video pipeline, video analysis (annotations, reference library, compare, recorded commentary) and the coaching product (plans, coach dashboard, check-ins, tests, calendar, profile) are built; chat, notifications, Stripe payments and Realtime (Part E) are built too, with Realtime untested against a real server. Start with `CLAUDE.md` (rules for working here) and `docs/system/` (what is built).

## Layout

| Path | What it is |
|---|---|
| `apps/marketing` | SvelteKit 3 static site (adapter-static) for Netlify |
| `apps/app` | SvelteKit 3 app (adapter-node run on Bun): Clerk sign-in, role guard, app shell, shell-only PWA; video library and player, annotations, compare, analysis recorder, plans, coach dashboard, calendar, profile, chat, notifications, billing |
| `apps/worker` | Bun worker: pg-boss consumer: `video.uploaded` transcode, poster and scrub sprite with ffmpeg; `analysis.segment.uploaded` recordings; retention and stalled sweeps; internal health check |
| `packages/ui` | Skeleton v5 `ttg` theme, tokens, fonts (shared by both apps; see `docs/style-guide.md`) |
| `packages/shared` | `siteConfig`, API and error schemas, storage keys and limits, job definitions |
| `packages/db` | SQL migrations and runner, `Db` and the Effect services (`Users`, `Videos`, `Annotations`, `Analyses`, `Segments`, `Queue`, `Questionnaires`, `Drills`, `Plans`, `Coaching`, `CheckIns`, `Assessments`, `Profiles`, `Notifications`, `Chat`, `Billing`, `Realtime`) |
| `legacy/` | Original static HTML pages and images, kept until the marketing cutover is verified |
| `docs/` | `roadmap.md` (Trey's decisions), `checklist.md`, `app_spec.md`, `work_plan.md`, `style-guide.md`, `ARCHITECTURE.md`, `deploy.md`, `system/` (current state) |

## Develop

Requires [Bun](https://bun.sh) (use Bun only) and Docker (for the local database).

```bash
bun install
docker compose up -d db        # local Postgres on port 54322 (same image as the VPS)
cp .env.example .env           # then fill in values; .env is gitignored
bun run db:migrate             # apply database migrations

bun run dev                    # marketing dev server
bun run --filter @ttg/marketing images   # regenerate the responsive WebP/AVIF variants after changing a source in apps/marketing/static/images
bun run dev:app                # app dev server
bun run --filter @ttg/worker dev   # worker (needs the database)

bun run build                  # build every workspace
bun run check                  # typecheck (svelte-check / tsc)
bun run test                   # Vitest in apps/app, packages/db, packages/shared, packages/ui, apps/worker
```

The `/dev/*` pages preview the screens against in-memory mock APIs without Clerk (dev only). Database tests create throwaway databases on the local container, so `docker compose up -d db` must be running. To view a legacy page, open the file in `legacy/` in a browser.

## Test on a phone

Expose the app dev server with a [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) quick tunnel (no account needed):

```bash
bun run dev:app                                  # terminal 1, port 5173
cloudflared tunnel --url http://localhost:5173   # terminal 2, prints https://<random>.trycloudflare.com
```

Open the printed URL on the phone; hot reload works, so edits show up as you save. The URL changes each time cloudflared restarts. `apps/app/vite.config.ts` allows `*.trycloudflare.com` hosts. Clerk's dev instance may need the tunnel origin allowed before sign-in works. Camera, microphone and install-to-home-screen need HTTPS, which the tunnel provides.

For a permanent dev URL, use an ngrok free static domain instead (`ngrok http --url=<your-domain>.ngrok-free.app 5173`). The author runs the app, worker and ngrok as systemd user services (`ttg-app`, `ttg-worker`, `ttg-ngrok` in `~/.config/systemd/user/`; manage with `systemctl --user`, logs with `journalctl --user -u ttg-app`). If the phone can't load the ngrok URL, disconnect any NordVPN server on the phone (Meshnet can stay on); on first visit ngrok shows a warning page with a Visit Site button.

## Environment

`.env` at the repo root holds real keys and is never committed; `.env.example` lists the variable names (Postgres, Clerk, R2). The marketing site also reads `PUBLIC_APP_URL` and `PUBLIC_SHOW_APP_LINKS` (see `apps/marketing/.env.example`) to show the Sign In / Get Started links only when the app is live. Production values live in Coolify, not in files; see `docs/deploy.md`.

## Docker

```bash
docker build -f apps/app/Dockerfile -t ttg-app .
docker build -f apps/worker/Dockerfile -t ttg-worker .
```

Both build from the repo root. The app container applies migrations on start. Details and the Coolify settings are in `docs/deploy.md`.

## Deploy

- **Marketing**: Netlify currently deploys the live site from the repo root on `main` (the original HTML). Do not push the restructure to `main` until the GitHub org exists and Netlify is relinked with base `apps/marketing` and publish `apps/marketing/build` (`apps/marketing/netlify.toml`, spec section 3.A.0).
- **App and worker**: Hostinger VPS via Coolify (`app.treythornockgolf.com`). Not deployed yet; see `docs/deploy.md`.

## Service worker recovery

Both apps register a service worker in production builds. If a site looks stale or broken after a deploy, remove the worker and its caches, then reload.

- Chrome or Edge: DevTools > Application > Service workers > Unregister, then Application > Storage > Clear site data.
- Firefox: open `about:serviceworkers` and click Unregister, then clear cookies and site data for the site in Settings > Privacy.
- Safari: Develop > Service Workers > Unregister, then Safari > Settings > Privacy > Manage Website Data and remove the site.
- Console, any browser:

```js
navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
location.reload();
```
