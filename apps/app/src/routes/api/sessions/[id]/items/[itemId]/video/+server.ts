import type { RequestHandler } from './$types';
import { clearSessionItemVideo, setSessionItemVideo } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player, own session only: attach (or replace) the optional video that shows they know this drill. */
export const PUT: RequestHandler = (event) => runRoute(event, setSessionItemVideo);

/** Player, own session only: detach it. The video stays in their library. */
export const DELETE: RequestHandler = (event) => runRoute(event, clearSessionItemVideo);
