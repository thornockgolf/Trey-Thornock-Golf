# apps/worker

pg-boss consumer and ffmpeg pipeline. `video.uploaded` (spec 3.C.2) is handled by
`src/process-video.ts`: download the source from R2, probe, transcode (H.264/AAC, faststart, max
1080p, constant frame rate, keyframe every 0.5 s), poster, scrub sprite + WebVTT, upload to
`processed/{id}/`, mark the video ready. The source is never deleted.

- `src/storage.ts`: R2 download/upload (streamed), plus an in-memory fake for tests.
- `src/ffmpeg.ts`: ffprobe/ffmpeg helpers with timeouts and a `-threads` cap.
- `src/handlers.ts`: queue registration and env settings; `src/main.ts`: process entry and `/healthz`.

Tests: `bun run test` (needs ffmpeg and `docker compose up -d db`). Real R2 check (creates and then
deletes its own objects and rows): `bun --env-file=../../.env scripts/r2-roundtrip.ts`. Deploy settings are in `docs/deploy.md`.
