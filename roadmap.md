1. need to turn the index.html  pages into a svelte and sveltekit project. 
2. need to make sure it is pwa compatiable. 
3. the html pages I currently have are landing pages that need some reorganizeing and better thought out flow. but for now that is lower on the priority list.
4. need to do add a sign in and sign up feature to the landing page for the coaching app we're building. The app is going to be a golf video analysis and coaching app. maybe using clerk.dev for this.
5. need to do some more research on what technology I would use for the video analysis. So far I'm thinking video.js or maybe ffmpeg. The features I want to implement is to scrub back and forth, automatic replay when the video end, and the ability to add annotations to the video like drawing on top of the video. maybe fabric.js could help me with the annotations. I also want to be able to add a compare feature that compares two videos side by side from a professional golfer to the users uploaded video. The compare feature should be able to play both videos side by side and have a slider for both videos to scrub back and forth between the two videos.
   - **Decision:** video.js (client-side playback/scrubbing/compare slider), Fabric.js (canvas annotation overlay on top of the video), and ffmpeg (server-side only, one-time transcode/thumbnail on upload) — all three are used together, each for a different layer. See item 8's decision below for why annotations are stored separately from the video file.
6. need to add a way to upload videos to the app. I'm thinking of using multer for this. what are some other options?
   - **Decision:** direct-to-storage upload via presigned URLs (browser uploads straight to Cloudflare R2, not routed through the app server), using Uppy.js on the frontend for progress/retries/chunking. Multer-style server-proxied uploads don't scale well for large video files.
7. need to add a way to store the videos in the database. I'm thinking of using mongodb for this. what are some other options?
   - **Decision:** video files never go in a database — they go in **Cloudflare R2** (S3-compatible object storage, no egress fees). The database (Postgres, via self-hosted Supabase) only stores metadata/URLs pointing to the files. Postgres over MongoDB because the data model (users → coaches → videos → annotations → plans → payments) is relational.
8. The coach should be able to rerecord parts of the analysis video without losing everything before the rerecorded part. This will be a feature that is only available to the coach.
   - **Decision:** annotations are stored as JSON (shape + timestamp) in Postgres, not burned into the video file. This means re-recording a segment only replaces that time range's video data; annotations tied to untouched timestamps stay valid. This must be the approach from day one — baking annotations into the video pixels would make this feature much harder later.
9. need to add a feature to overlay another video on top of the users video. maybe a video of a professional golfer or a video of the golfers previous swing.
10. payments will be handled by this app. we will need to use stripe for this. I don't have an account yet and will need to research how to hook it up to the app.
11. need to take his player profile page and integrate it. 
12. need to add a chat feature to the app. so a user can chat with their coach about their swing, questions, etc. which means a notification system is needed. I'm thinking of using socket.io for this. what are some other options?
    - **Decision:** Supabase Realtime, self-hosted alongside Postgres.
13. users and coach should be able to download the videos.
14. need to expand on the intake questionaire form that trey has. needs to be less of a open ended question and more asking questions about the users swing and what they want to improve on.
15. structured practice plans are already in place in the other html pages, need to review those and make sure they are intuitive for viewing. maybe add in a calendar view for practice plan, checkins, tests/assessments.
16. As of now we are invisioning two services. One that a user will fill out the intake questionaire and they will describe what they believe is wrong with their swing and game. Then a practice plan will be generated for them based on their answers. The other service is a one on one coaching service where a user will have a coach that will help them with their swing and game. The coach will be able to see the users video analysis and provide feedback on their swing and game. The coach will also be able to provide practice plans for the user to follow.

## Infrastructure & Stack Decisions (self-managed, open-source-first)

We're managing infra ourselves and favoring open source / generous free tiers over managed BaaS platforms.

- **App framework:** SvelteKit (item 1).
- **Hosting split:** marketing/landing pages (items 1–3, `treythornockgolf.com`) stay on **Netlify** — static/SEO content, no reason to move it. The actual app (auth, dashboard, video, chat, payments, `app.treythornockgolf.com`) is a separate SvelteKit deployment on the VPS, since it needs a persistent server for the database, Realtime, and the ffmpeg/pg-boss worker — none of which fit Netlify's serverless model. "Sign In / Get Started" on the marketing site just links over to the app subdomain.
- **Auth:** Clerk (hosted, free up to 10K MAU).
- **Database:** Postgres via **self-hosted Supabase** (Docker stack), used for Postgres + Realtime.
- **Realtime (chat, item 12):** Supabase Realtime, self-hosted, part of the same stack.
- **Video/file storage:** **Cloudflare R2** — S3-compatible, no egress fees, free tier covers early stage (10GB storage, 1M write-ops, 10M read-ops/mo).
- **Video upload:** presigned R2 URLs + Uppy.js (item 6).
- **Video processing:** **ffmpeg**, run as a background worker process on the VPS, consuming a job queue.
- **Job queue:** **pg-boss** (Postgres-backed queue) for the ffmpeg pipeline.
- **Hosting:** **Hetzner CX33** (4 vCPU / 8GB RAM, ~$7/mo) running everything — Postgres, Supabase stack, ffmpeg worker, app server.
- **Deployment/orchestration:** **Coolify** (self-hosted, open-source PaaS) on the Hetzner box, for one-click Docker deploys instead of hand-rolled deploy scripts.
- **Payments:** Stripe (item 10), unchanged.

## Post-MVP / Future

- **Pose-estimation / ML-based swing analysis** (OpenCV + MediaPipe) — intentionally deferred until after MVP ships. It's a separate concern from the core coaching/booking/video workflow, is the highest-risk/most time-consuming piece technically, and naturally belongs in its own Python service rather than the SvelteKit app.
  - To avoid a rearchitecture later: keep original/source video files (not just ffmpeg-processed versions) in R2, since pose estimation will want the source footage.
  - When added, it plugs into the existing pg-boss job queue as a new job type (e.g. `video.uploaded` also triggers a pose-estimation job consumed by a Python worker) — no changes needed to the queue architecture itself.