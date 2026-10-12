import { error } from '@sveltejs/kit';
import { handle } from '../coach-store';
import type { RequestHandler } from './$types';

// Dev only: the coach APIs (drills, plans, players, notes, ...) served from memory; see coach-store.ts.
const serve: RequestHandler = async ({ request, params }) => {
	const body = request.method === 'GET' ? undefined : await request.json().catch(() => undefined);
	return handle(request.method, params.rest ?? '', body) ?? error(404, 'Not found');
};
export const GET = serve;
export const POST = serve;
export const PATCH = serve;
export const PUT = serve;
export const DELETE = serve;
