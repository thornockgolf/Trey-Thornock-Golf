import { Cause, Effect, Exit, type ManagedRuntime, Result } from 'effect';
import type { RequestEvent } from '@sveltejs/kit';
import { INTERNAL_ERROR, isAppError, toHttpError } from './http-errors';
import { RequestContext } from './request-context';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
	});

/**
 * Every `+server.ts` handler runs through `runRoute`. The effect may succeed with a `Response`
 * (used as is) or any JSON value (sent as 200). Tagged errors map to their status with a stable
 * `{ code, message }` body; anything else (defects) becomes a generic 500 and is logged.
 */
export const makeRunRoute =
	<R>(runtime: ManagedRuntime.ManagedRuntime<R, never>) =>
	async <A>(event: RequestEvent, effect: Effect.Effect<A, unknown, R | RequestContext>): Promise<Response> => {
		const exit = await runtime.runPromiseExit(
			effect.pipe(Effect.provideService(RequestContext, RequestContext.of({ event })))
		);
		if (Exit.isSuccess(exit)) {
			return exit.value instanceof Response ? exit.value : json(exit.value);
		}
		const found = Cause.findError(exit.cause);
		if (Result.isSuccess(found) && isAppError(found.success)) {
			const { status, body } = toHttpError(found.success);
			return json(body, status);
		}
		console.error('Unhandled route error:', Cause.pretty(exit.cause));
		return json(INTERNAL_ERROR.body, INTERNAL_ERROR.status);
	};
