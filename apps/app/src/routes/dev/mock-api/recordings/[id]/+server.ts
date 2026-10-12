import { putRecording } from '../../segment-store';
import type { RequestHandler } from './$types';

// Dev only: stands in for the presigned R2 PUT of a coach recording.
export const PUT: RequestHandler = async ({ params, request }) =>
	putRecording(params.id, Buffer.from(await request.arrayBuffer()), request.headers.get('content-type') ?? 'application/octet-stream');
