import type { RequestHandler } from './$types';
import { SignPartRequest } from '@ttg/shared';
import { Effect } from 'effect';
import { decodeBody } from '#lib/server/decode';
import { runRoute } from '#lib/server/runtime';
import { signPart } from '#lib/server/videos';

/** Owner only: presign one part of the video's multipart upload. */
export const POST: RequestHandler = (event) => runRoute(event, decodeBody(SignPartRequest).pipe(Effect.flatMap(signPart)));
