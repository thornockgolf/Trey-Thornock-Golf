import type { RequestHandler } from './$types';
import { currentUser } from '#lib/server/auth';
import { runRoute } from '#lib/server/runtime';

/** The signed-in user and their role. Any signed-in user (spec section 5). */
export const GET: RequestHandler = (event) => runRoute(event, currentUser);
