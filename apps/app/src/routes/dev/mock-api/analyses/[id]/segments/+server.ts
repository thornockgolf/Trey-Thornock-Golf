import { createSegment, listSegments } from '../../../segment-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params, url }) => listSegments(params.id, url.searchParams);
export const POST: RequestHandler = async ({ params, request }) => createSegment(params.id, await request.json().catch(() => undefined));
