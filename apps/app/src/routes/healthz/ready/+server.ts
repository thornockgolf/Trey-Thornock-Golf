import type { RequestHandler } from './$types';
import { readiness } from '#lib/server/readiness';
import { runRoute } from '#lib/server/runtime';

// For the uptime monitor: database and job queue, not just "the process is up" (that is /healthz).
export const GET: RequestHandler = (event) => runRoute(event, readiness);
