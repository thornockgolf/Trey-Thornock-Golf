import { Effect, Schema } from 'effect';
import { RequestContext } from './request-context';
import { ValidationError } from './errors';

/** Field paths named in an Effect schema error (`at ["sizeBytes"]`, `at ["parts", 0, "etag"]`), like `parts.0.etag`. */
export const failedFields = (schemaMessage: string): string[] => {
	const found = new Set<string>();
	for (const m of schemaMessage.matchAll(/at \[([^\]]*)\]/g)) {
		const path = m[1]!
			.split(',')
			.map((p) => p.trim().replace(/^"|"$/g, ''))
			.filter(Boolean)
			.join('.');
		if (path) found.add(path);
	}
	return [...found];
};

/** A short message for clients: which fields are wrong, without the schema's internal wording. */
export const invalidBodyMessage = (schemaMessage: string) => {
	const fields = failedFields(schemaMessage);
	return fields.length > 0 ? `Invalid request: check ${fields.join(', ')}` : 'Invalid request body';
};

/** Decode a JSON request body with an Effect Schema from `packages/shared`. */
export const decodeBody = <S extends Schema.Decoder<unknown, never>>(schema: S) =>
	Effect.gen(function* () {
		const { event } = yield* RequestContext;
		const json = yield* Effect.tryPromise({
			try: () => event.request.json() as Promise<unknown>,
			catch: () => new ValidationError({ message: 'Request body must be valid JSON' })
		});
		return yield* Schema.decodeUnknownEffect(schema)(json, { errors: 'all' }).pipe(
			Effect.mapError((e) => new ValidationError({ message: invalidBodyMessage(e.message) }))
		);
	});
