import type { RequestHandler } from './$types';
import { CompleteMultipartRequest } from '@ttg/shared';
import { Effect } from 'effect';
import { decodeBody } from '#lib/server/decode';
import { runRoute } from '#lib/server/runtime';
import { completeMultipart } from '#lib/server/videos';

/** Owner only: assemble the parts into the object. The client still calls `/complete` afterwards. */
export const POST: RequestHandler = (event) =>
	runRoute(event, decodeBody(CompleteMultipartRequest).pipe(Effect.flatMap(completeMultipart)));
