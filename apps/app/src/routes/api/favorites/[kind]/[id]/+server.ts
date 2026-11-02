import type { RequestHandler } from './$types';
import { addFavorite, removeFavorite } from '#lib/server/plans';
import { runRoute } from '#lib/server/runtime';

/** Player: star a session of their plan or a drill in it (`kind` is `session` or `drill`). Idempotent. */
export const PUT: RequestHandler = (event) => runRoute(event, addFavorite);

/** Player: remove the star. Idempotent. */
export const DELETE: RequestHandler = (event) => runRoute(event, removeFavorite);
