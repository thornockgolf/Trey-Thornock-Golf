import { Coaching, Profiles, Users, Videos } from '@ttg/db';
import { TestDb } from '@ttg/db/testing';
import { MAX_PHOTO_BYTES, keys } from '@ttg/shared';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { afterAll, describe, expect, it } from 'vitest';
import { CoachAllowlist } from './auth';
import { getProfile, completePhotoUpload, requestPhotoUpload, updateProfile } from './profile';
import { addNote } from './players';
import { makeFakeR2 } from './r2-fake';
import { makeRunRoute } from './run-route';
import { fakeEvent } from './test-utils';

const r2 = makeFakeR2();
const Services = Layer.mergeAll(Users.layer, Videos.layer, Coaching.layer, Profiles.layer).pipe(Layer.provideMerge(TestDb));
const rt = ManagedRuntime.make(Layer.mergeAll(CoachAllowlist.layerFromCsv('coach_a'), r2.layer, Services));
const run = makeRunRoute(rt);
afterAll(() => rt.dispose());

const call = async (effect: Effect.Effect<any, any, any>, user: string | null, body?: unknown, params: Record<string, string> = {}) => {
	const res = await run(fakeEvent({ userId: user, body, params }), effect as never);
	return { status: res.status, body: (await res.json()) as any };
};
const player = (clerk: string) => rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: clerk, role: 'player' })));

describe('GET and PUT /api/profile', () => {
	it('is the player\'s own, and the coach and anonymous callers are turned away', async () => {
		await player('pl_pr0');
		expect((await call(getProfile, 'pl_pr0')).body.summary).toEqual({ videos: 0, plan: null, subscriptionStatus: null });
		expect((await call(getProfile, 'coach_a')).status).toBe(403);
		expect((await call(updateProfile, 'coach_a', { handicap: 5 })).status).toBe(403);
		expect((await call(getProfile, null)).status).toBe(401);
	});

	it('saves, persists and clears fields; the handicap must be -10 to 54', async () => {
		await player('pl_pr1');
		const saved = await call(updateProfile, 'pl_pr1', { displayName: ' Sam Rivera ', handicap: 14.5, goals: 'Break 90', homeCourse: 'Duke Golf Club', hand: 'left', equipment: 'TaylorMade irons', limitations: 'Sore left wrist' });
		expect(saved.status).toBe(200);
		expect(saved.body).toMatchObject({ displayName: 'Sam Rivera', handicap: 14.5, goals: 'Break 90', homeCourse: 'Duke Golf Club', hand: 'left', equipment: 'TaylorMade irons', limitations: 'Sore left wrist' });
		// persists across requests, and a partial update changes only what it names
		expect((await call(updateProfile, 'pl_pr1', { handicap: 12 })).body).toMatchObject({ handicap: 12, goals: 'Break 90', displayName: 'Sam Rivera' });
		expect((await call(getProfile, 'pl_pr1')).body.handicap).toBe(12);
		// blank text and null clear
		const cleared = await call(updateProfile, 'pl_pr1', { goals: '   ', hand: null, handicap: null });
		expect(cleared.body).toMatchObject({ goals: null, hand: null, handicap: null, homeCourse: 'Duke Golf Club' });
		for (const bad of [{ handicap: -10.1 }, { handicap: 54.1 }, { handicap: 'high' }, { hand: 'both' }, { goals: 'x'.repeat(1001) }]) {
			expect((await call(updateProfile, 'pl_pr1', bad)).status).toBe(422);
		}
		expect((await call(getProfile, 'pl_pr1')).body.handicap).toBeNull(); // the bad requests changed nothing
		expect((await call(updateProfile, 'pl_pr1', { handicap: -10 })).body.handicap).toBe(-10);
		expect((await call(updateProfile, 'pl_pr1', { handicap: 54 })).body.handicap).toBe(54);
	});

	it('another player\'s profile is never reachable, and coach notes never appear in any response', async () => {
		const pl = await player('pl_pr2');
		await player('pl_pr3');
		const coach = await rt.runPromise(Effect.flatMap(Users, (u) => u.ensure({ clerkUserId: 'coach_a', role: 'coach' })));
		await rt.runPromise(Effect.flatMap(Coaching, (c) => c.assign(coach.id, pl.id)));
		expect((await call(addNote, 'coach_a', { body: 'SECRET coach observation' }, { id: pl.id })).status).toBe(200);
		await call(updateProfile, 'pl_pr2', { goals: 'Lower my handicap' });
		const mine = await call(getProfile, 'pl_pr2');
		expect(JSON.stringify(mine.body)).not.toContain('SECRET');
		expect(JSON.stringify((await call(updateProfile, 'pl_pr2', { equipment: 'x' })).body)).not.toContain('SECRET');
		// player pr3 only ever gets their own (there is no id in the route to change)
		expect((await call(getProfile, 'pl_pr3')).body.userId).not.toBe(pl.id);
	});
});

describe('profile photo', () => {
	it('goes through a presigned PUT for the player\'s own key, with image type and size limits', async () => {
		const pl = await player('pl_ph1');
		for (const bad of [{ contentType: 'image/gif', sizeBytes: 1000 }, { contentType: 'video/mp4', sizeBytes: 1000 }, { contentType: 'image/png', sizeBytes: MAX_PHOTO_BYTES + 1 }, { contentType: 'image/png', sizeBytes: 0 }]) {
			expect((await call(requestPhotoUpload, 'pl_ph1', bad)).status).toBe(422);
		}
		const ok = await call(requestPhotoUpload, 'pl_ph1', { contentType: 'image/png', sizeBytes: 50_000 });
		expect(ok.status).toBe(200);
		expect(ok.body.upload.url).toContain(keys.profilePhoto(pl.id, 'png'));
		expect(ok.body.upload.headers).toEqual({ 'Content-Type': 'image/png' });
		expect((await call(requestPhotoUpload, 'coach_a', { contentType: 'image/png', sizeBytes: 5 })).status).toBe(403);
	});

	it('is only used after the upload is verified, and the profile shows a signed URL, not the key', async () => {
		const pl = await player('pl_ph2');
		expect((await call(completePhotoUpload, 'pl_ph2', { contentType: 'image/jpeg' })).status).toBe(409); // not uploaded yet
		expect((await call(getProfile, 'pl_ph2')).body.photoUrl).toBeNull();

		const key = keys.profilePhoto(pl.id, 'jpg');
		r2.objects.set(key, { sizeBytes: MAX_PHOTO_BYTES + 5, contentType: 'image/jpeg' });
		expect((await call(completePhotoUpload, 'pl_ph2', { contentType: 'image/jpeg' })).status).toBe(409); // too big
		r2.objects.set(key, { sizeBytes: 40_000, contentType: 'image/jpeg' });
		const done = await call(completePhotoUpload, 'pl_ph2', { contentType: 'image/jpeg' });
		expect(done.status).toBe(200);
		expect(done.body.photoUrl).toContain(key);
		expect(JSON.stringify(done.body)).not.toContain('photoKey');
		expect((await call(completePhotoUpload, 'pl_ph2', { contentType: 'image/gif' })).status).toBe(422);
		// another player's upload under their own key does not touch this profile
		const other = await player('pl_ph3');
		r2.objects.set(keys.profilePhoto(other.id, 'jpg'), { sizeBytes: 10, contentType: 'image/jpeg' });
		expect((await call(getProfile, 'pl_ph3')).body.photoUrl).toBeNull();
	});
});
