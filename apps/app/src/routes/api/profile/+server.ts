import type { RequestHandler } from './$types';
import { getProfile, updateProfile } from '#lib/server/profile';
import { runRoute } from '#lib/server/runtime';

/** Player only: your own profile. */
export const GET: RequestHandler = (event) => runRoute(event, getProfile);
export const PUT: RequestHandler = (event) => runRoute(event, updateProfile);
