import type { RequestEvent } from '@sveltejs/kit';
import type { Role } from '@ttg/shared';
import { Users, type User } from '@ttg/db';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { CoachAllowlist } from './auth';
import { makeRunLoad, makeRunRoute } from './run-route';

/** A minimal RequestEvent: only what handlers read in tests. */
export const fakeEvent = (
	opts: { userId?: string | null; body?: unknown; rawBody?: string; params?: Record<string, string>; query?: string } = {}
) =>
	({
		request: new Request('http://localhost/api/test', {
			method: 'POST',
			body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
		}),
		locals: { auth: () => ({ userId: opts.userId ?? null }) },
		params: opts.params ?? {},
		url: new URL(`http://localhost/api/test${opts.query ?? ''}`)
	}) as unknown as RequestEvent;

/** In-memory Users: ids are stable per clerk id, roles follow what `ensure` is given. */
export const FakeUsers = Layer.sync(Users, () => {
	const rows = new Map<string, User>();
	return Users.of({
		ensure: ({ clerkUserId, role }: { clerkUserId: string; role: Role }) =>
			Effect.sync(() => {
				const u: User = { id: `id_${clerkUserId}`, clerkUserId, role, displayName: null, email: null };
				rows.set(clerkUserId, u);
				return u;
			}),
		findByClerkId: (id: string) => Effect.sync(() => rows.get(id)),
		findById: (id: string) => Effect.sync(() => [...rows.values()].find((u) => u.id === id)),
		setDisplayName: (id: string, name: string | null) =>
			Effect.sync(() => {
				const u = [...rows.values()].find((x) => x.id === id);
				if (!u) return undefined;
				const next = { ...u, displayName: name };
				rows.set(u.clerkUserId, next);
				return next;
			})
	});
});

export const testRunRoute = (coachIds = 'coach_1', users: Layer.Layer<Users> = FakeUsers) =>
	makeRunRoute(ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv(coachIds), users)));

export const testRunLoad = (coachIds = 'coach_1', users: Layer.Layer<Users> = FakeUsers) =>
	makeRunLoad(ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv(coachIds), users)));
