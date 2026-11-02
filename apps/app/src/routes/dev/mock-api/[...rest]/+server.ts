import { error } from '@sveltejs/kit';
import { handle } from '../coach-store';
import { commsHandle } from '../comms-store';
import { feedbackHandle } from '../feedback-store';
import { loggedHandle } from '../logged-store';
import { planHandle } from '../plan-store';
import { searchHandle } from '../search-store';
import type { RequestHandler } from './$types';

// Dev only: the coach APIs (drills, plans, players, notes, ...) served from memory; see coach-store.ts.
const serve: RequestHandler = async ({ request, params, url }) => {
	const body = request.method === 'GET' ? undefined : await request.json().catch(() => undefined);
	return (await searchHandle(request.method, params.rest ?? '', url)) ?? planHandle(request.method, params.rest ?? '', body) ?? loggedHandle(request.method, params.rest ?? '', body) ?? feedbackHandle(request.method, params.rest ?? '', body, url) ?? commsHandle(request.method, params.rest ?? '', body, url) ?? handle(request.method, params.rest ?? '', body) ?? error(404, 'Not found');
};
export const GET = serve;
export const POST = serve;
export const PATCH = serve;
export const PUT = serve;
export const DELETE = serve;
