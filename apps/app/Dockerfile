# App (SvelteKit, adapter-node run on Bun). Build from the repo root:
#   docker build -f apps/app/Dockerfile -t ttg-app .
ARG BUN_VERSION=1.4.2

# ---- build ----
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /repo
# Workspace manifests first so the install layer is cached until dependencies change.
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/app/package.json apps/app/
COPY apps/marketing/package.json apps/marketing/
COPY apps/worker/package.json apps/worker/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --filter @ttg/app
COPY apps/app apps/app
COPY packages packages
# `bun build/index.js` needs real values only at runtime; the build reads declared env vars, so
# placeholders satisfy the validator and are never baked into the output (they are `static: false`).
ENV DATABASE_URL=build PUBLIC_CLERK_PUBLISHABLE_KEY=build CLERK_SECRET_KEY=build \
    R2_ENDPOINT=https://build.invalid R2_ACCESS_KEY_ID=build R2_SECRET_ACCESS_KEY=build R2_BUCKET=build
RUN bun run --filter @ttg/app build

# ---- runtime ----
FROM oven/bun:${BUN_VERSION} AS runtime
WORKDIR /repo
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/
COPY apps/marketing/package.json apps/marketing/
COPY apps/worker/package.json apps/worker/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --production --filter @ttg/app
# Migrations run on start (packages/db), then the server.
COPY packages/db packages/db
COPY packages/shared packages/shared
COPY --from=build /repo/apps/app/build apps/app/build
COPY apps/app/docker-entrypoint.sh apps/app/docker-entrypoint.sh
USER bun
WORKDIR /repo/apps/app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "docker-entrypoint.sh"]
