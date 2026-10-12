import type { RequestHandler } from './$types';
import { runRoute } from '#lib/server/runtime';
import { createVideo, listMyVideos } from '#lib/server/videos';

/** The signed-in user's videos, newest first. */
export const GET: RequestHandler = (event) => runRoute(event, listMyVideos);

/** Start an upload: validates type and size, creates the row, returns a presigned PUT or multipart plan. */
export const POST: RequestHandler = (event) => runRoute(event, createVideo);
