import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import type { RequestEvent } from '@sveltejs/kit';
import { requireRole } from './auth';

/** Every page and endpoint under /coach is coach-only. Kit routing is case-sensitive. */
export const isCoachPath = (pathname: string) => pathname === '/coach' || pathname.startsWith('/coach/');

type RunRoute = (event: RequestEvent, effect: ReturnType<typeof requireRole>) => Promise<Response>;

/**
 * Role guard for the /coach tree (spec 3.B.1): a player gets 403 and nothing is leaked; anything
 * that is not a clean "coach" answer (including a database failure) is denied, never allowed.
 * Individual coach-only API handlers elsewhere still call `requireRole('coach')` themselves.
 * Runs after the session guard, so a missing session was already redirected or answered with 401.
 */
export const coachGuard =
	(run: RunRoute): Handle =>
	async ({ event, resolve }) => {
		if (!isCoachPath(event.url.pathname)) return resolve(event);
		const res = await run(event, requireRole('coach'));
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			error(res.status, body.message ?? 'Forbidden');
		}
		return resolve(event);
	};
