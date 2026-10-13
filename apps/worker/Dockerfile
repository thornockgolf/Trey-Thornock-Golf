# Worker (pg-boss consumer + ffmpeg). Build from the repo root:
#   docker build -f apps/worker/Dockerfile -t ttg-worker .
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}
# ffmpeg for transcoding (Part C); ca-certificates for TLS to R2; a font for the text of annotations drawn into an
# analysis export (sharp renders them through fontconfig)
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production PORT=8081
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/
COPY apps/marketing/package.json apps/marketing/
COPY apps/worker/package.json apps/worker/
COPY packages/ui/package.json packages/ui/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN bun install --frozen-lockfile --production --filter @ttg/worker
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/worker apps/worker
# Scratch space for downloads and transcodes; mount a size-limited volume here in Coolify.
RUN mkdir -p /tmp/ttg-work && chown bun:bun /tmp/ttg-work
ENV WORK_DIR=/tmp/ttg-work
USER bun
WORKDIR /repo/apps/worker
# No EXPOSE: the worker publishes no port. /healthz is reachable only inside the Docker network.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||8081)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "src/main.ts"]
