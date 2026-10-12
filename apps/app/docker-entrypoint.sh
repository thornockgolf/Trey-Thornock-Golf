#!/bin/sh
# Apply database migrations, then start the server. A failing migration exits non-zero, the
# health check never passes, and Coolify keeps the previous container serving.
set -e
bun /repo/packages/db/src/cli.ts
exec bun build/index.js
