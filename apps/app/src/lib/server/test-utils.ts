import type { RequestEvent } from '@sveltejs/kit';
import { ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { makeRunRoute } from './run-route';

/** A minimal RequestEvent: only what handlers read in tests. */
export const fakeEvent = (opts: { userId?: string | null; body?: unknown; rawBody?: string } = {}) =>
	({
		request: new Request('http://localhost/api/test', {
			method: 'POST',
			body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
		}),
		locals: { auth: () => ({ userId: opts.userId ?? null }) },
		params: {},
		url: new URL('http://localhost/api/test')
	}) as unknown as RequestEvent;

export const testRunRoute = (coachIds = 'coach_1') =>
	makeRunRoute(ManagedRuntime.make(CoachAllowlist.layerFromCsv(coachIds)));
