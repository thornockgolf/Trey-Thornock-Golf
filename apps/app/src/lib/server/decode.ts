import { Effect, Schema } from 'effect';
import { RequestContext } from './request-context';
import { ValidationError } from './errors';

/** Decode a JSON request body with an Effect Schema from `packages/shared`. */
export const decodeBody = <S extends Schema.Decoder<unknown, never>>(schema: S) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const json = yield* Effect.tryPromise({
			try: () => event.request.json() as Promise<unknown>,
			catch: () => new ValidationError({ message: 'Request body must be valid JSON' })
		});
		return yield* Schema.decodeUnknownEffect(schema)(json).pipe(
			Effect.mapError((e) => new ValidationError({ message: e.message }))
		);
	});
