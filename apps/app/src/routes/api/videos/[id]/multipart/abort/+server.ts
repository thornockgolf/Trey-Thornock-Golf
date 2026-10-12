import type { RequestHandler } from './$types';
import { AbortMultipartRequest } from '@ttg/shared';
import { Effect } from 'effect';
import { decodeBody } from '#lib/server/decode';
import { runRoute } from '#lib/server/runtime';
import { abortMultipart } from '#lib/server/videos';

/** Owner only: cancel the multipart upload and free the stored parts. */
export const POST: RequestHandler = (event) =>
	runRoute(event, decodeBody(AbortMultipartRequest).pipe(Effect.flatMap((b) => abortMultipart(b.uploadId))));
