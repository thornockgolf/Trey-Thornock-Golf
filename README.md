# Trey Thornock Golf

Marketing site and (in progress) golf video-analysis and coaching app for Trey Thornock, PGA coach in Durham, NC. This is a Bun-workspaces monorepo. Specs and plans are in `docs/`; start with `CLAUDE.md`.

## Layout

- `apps/marketing`: SvelteKit 3 static site (adapter-static), deployed to Netlify. Being ported from `legacy/`.
- `apps/app`, `apps/worker`: placeholders for the coaching app and the ffmpeg/pg-boss worker (see `docs/app_spec.md` Parts B-F).
- `packages/ui` (`@ttg/ui`): Skeleton v5 theme, tokens, base styles, self-hosted fonts. Shared by both apps; spec in `docs/style-guide.md`.
- `packages/shared` (`@ttg/shared`): `siteConfig` and, later, Effect Schemas.
- `packages/db`: placeholder for migrations and typed queries.
- `legacy/`: the original static HTML pages and `images/`, kept until cutover is verified. `legacy/index-trey-website.html` is the practice-plan generator (deployed separately at `treythornockgolfpractice.netlify.app`) and `legacy/user-profile.html` is the profile page prototype.
- `docs/`: roadmap, checklist, app spec, work plan, style guide, architecture.

## Develop

Requires [Bun](https://bun.sh). Use Bun only.

```bash
bun install
bun run dev      # marketing dev server
bun run build    # build all workspaces
bun run check    # typecheck
```

To view a legacy page, open the file in `legacy/` directly in a browser.

## Deploy

Netlify currently deploys the live site from the repo root on `main` (original HTML). Do not push the restructure until the GitHub org exists and Netlify is relinked with base `apps/marketing`, publish `apps/marketing/build` (see `docs/app_spec.md` section 3.A.0). The app and worker deploy to a VPS via Coolify (Part B).

## Service worker recovery

The marketing site registers a service worker in production builds. If the site looks stale or broken after a deploy, remove the worker and its caches, then reload.

- Chrome or Edge: DevTools > Application > Service workers > Unregister, then Application > Storage > Clear site data.
- Firefox: open `about:serviceworkers` and click Unregister, then clear cookies and site data for the site in Settings > Privacy.
- Safari: Develop > Service Workers > Unregister, then Safari > Settings > Privacy > Manage Website Data and remove the site.
- Console, any browser:

```js
navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
caches.keys().then((ks) => ks.forEach((k) => caches.delete(k)));
location.reload();
```
