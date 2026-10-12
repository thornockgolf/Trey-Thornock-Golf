import type { RequestHandler } from './$types';
import { createPlan, listPlans } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Coach only: plan templates, newest first. */
export const GET: RequestHandler = (event) => runRoute(event, listPlans);

/** Coach only: compose a plan from drills. Each session's drill minutes must equal its length (30/45/60/90). */
export const POST: RequestHandler = (event) => runRoute(event, createPlan);
