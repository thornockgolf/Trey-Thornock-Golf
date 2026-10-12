import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { decodeBody } from './decode';
import { fakeEvent, testRunRoute } from './test-utils';

const run = testRunRoute();
const Body = Schema.Struct({ title: Schema.NonEmptyString, count: Schema.Int });

describe('decodeBody', () => {
	it('decodes a valid body', async () => {
		const res = await run(fakeEvent({ body: { title: 'x', count: 2 } }), decodeBody(Body));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ title: 'x', count: 2 });
	});

	it('returns 422 for a body that fails the schema', async () => {
		const res = await run(fakeEvent({ body: { title: '', count: 1.5 } }), decodeBody(Body));
		expect(res.status).toBe(422);
		expect((await res.json()).code).toBe('ValidationError');
	});

	it('returns 422 for invalid JSON', async () => {
		const res = await run(fakeEvent({ rawBody: '{nope' }), decodeBody(Body));
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({ code: 'ValidationError', message: 'Request body must be valid JSON' });
	});
});
