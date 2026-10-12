import { describe, expect, it, vi } from 'vitest';
import { DatabaseError } from '@ttg/db';
import { Effect } from 'effect';
import {
	Conflict,
	Forbidden,
	NotAuthenticated,
	NotFound,
	PaymentError,
	StorageError,
	ValidationError
} from './errors';
import { fakeEvent, testRunRoute } from './test-utils';

const run = testRunRoute();

describe('runRoute', () => {
	it('sends a successful value as JSON 200', async () => {
		const res = await run(fakeEvent(), Effect.succeed({ ok: true }));
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/json');
		expect(await res.json()).toEqual({ ok: true });
	});

	it('passes a Response through unchanged', async () => {
		const res = await run(fakeEvent(), Effect.succeed(new Response(null, { status: 201 })));
		expect(res.status).toBe(201);
	});

	it.each([
		['NotAuthenticated', new NotAuthenticated({ message: 'm' }), 401],
		['Forbidden', new Forbidden({ message: 'm' }), 403],
		['NotFound', new NotFound({ message: 'm' }), 404],
		['Conflict', new Conflict({ message: 'm' }), 409],
		['ValidationError', new ValidationError({ message: 'm' }), 422],
		['PaymentError', new PaymentError({ message: 'm' }), 402]
	])('maps %s to its status with { code, message }', async (code, error, status) => {
		const res = await run(fakeEvent(), Effect.fail(error));
		expect(res.status).toBe(status);
		expect(await res.json()).toEqual({ code, message: 'm' });
	});

	it('hides StorageError details', async () => {
		const res = await run(
			fakeEvent(),
			Effect.fail(new StorageError({ message: 'bucket ttg-secret exploded', cause: new Error('boom') }))
		);
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ code: 'StorageError', message: 'Storage operation failed' });
	});

	it('hides DatabaseError details behind a generic 500 and logs them', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await run(fakeEvent(), Effect.fail(new DatabaseError({ message: 'Query failed', cause: new Error('relation app.users password=hunter2') })));
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body).toEqual({ code: 'InternalError', message: 'Something went wrong' });
		expect(JSON.stringify(body)).not.toContain('hunter2');
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it('turns defects into a generic 500 and logs them', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await run(fakeEvent(), Effect.die(new Error('db password is hunter2')));
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body).toEqual({ code: 'InternalError', message: 'Something went wrong' });
		expect(JSON.stringify(body)).not.toContain('hunter2');
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it('treats an unknown failure value as an internal error', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res = await run(fakeEvent(), Effect.fail('plain string'));
		expect(res.status).toBe(500);
		log.mockRestore();
	});
});
