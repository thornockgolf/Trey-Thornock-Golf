import { Cause, Effect, Exit, type ManagedRuntime, Result } from 'effect';
import { error, type RequestEvent } from '@sveltejs/kit';
import type { ErrorBody } from '@ttg/shared';
import { INTERNAL_ERROR, isAppError, toHttpError } from './http-errors';
import { RequestContext } from './request-context';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});

type Outcome<A> = { ok: true; value: A } | { ok: false; status: number; body: ErrorBody };

/** Tagged errors keep their status and message; anything else becomes a generic 500 (and is logged). */
const toOutcome = <A>(exit: Exit.Exit<A, unknown>): Outcome<A> => {
	if (Exit.isSuccess(exit)) return { ok: true, value: exit.value };
	const found = Cause.findError(exit.cause);
	if (Result.isSuccess(found) && isAppError(found.success)) {
		// details of these never reach the client, so keep them in the logs
		if (found.success._tag === 'DatabaseError' || found.success._tag === 'StorageError') {
			console.error('Route error:', Cause.pretty(exit.cause));
		}
		return { ok: false, ...toHttpError(found.success) };
	}
	console.error('Unhandled route error:', Cause.pretty(exit.cause));
	return { ok: false, ...INTERNAL_ERROR };
};

const withRequest = <A, R>(event: RequestEvent, effect: Effect.Effect<A, unknown, R | RequestContext>) =>
	effect.pipe(Effect.provideService(RequestContext, RequestContext.of({ event })));

/**
 * Every `+server.ts` handler runs through `runRoute`. The effect may succeed with a `Response`
 * (used as is) or any JSON value (sent as 200). Tagged errors map to their status with a stable
 * `{ code, message }` body; anything else (defects) becomes a generic 500 and is logged.
 */
export const makeRunRoute =
	<R>(runtime: ManagedRuntime.ManagedRuntime<R, never>) =>
	async <A>(event: RequestEvent, effect: Effect.Effect<A, unknown, R | RequestContext>): Promise<Response> => {
		const out = toOutcome(await runtime.runPromiseExit(withRequest(event, effect)));
		if (!out.ok) return json(out.body, out.status);
		return out.value instanceof Response ? out.value : json(out.value);
	};

/**
 * For `+layout.server.ts` / `+page.server.ts` loads: returns the value, or throws SvelteKit's
 * `error(status, message)` using the same error mapping as `runRoute`.
 */
export const makeRunLoad =
	<R>(runtime: ManagedRuntime.ManagedRuntime<R, never>) =>
	async <A>(event: RequestEvent, effect: Effect.Effect<A, unknown, R | RequestContext>): Promise<A> => {
		const out = toOutcome(await runtime.runPromiseExit(withRequest(event, effect)));
		if (!out.ok) error(out.status, out.body.message);
		return out.value;
	};
