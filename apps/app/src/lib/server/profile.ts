import { Profiles, Users } from '@ttg/db';
import {
	MAX_PHOTO_BYTES,
	PHOTO_TYPES,
	PhotoUploadRequest,
	UpdateProfileRequest,
	keys,
	type ProfileDto
} from '@ttg/shared';
import { Effect, Schema } from 'effect';
import { requireRole } from './auth';
import { decodeBody } from './decode';
import { Conflict, NotFound } from './errors';
import { R2 } from './r2';

/**
 * The profile of a player as the API returns it: the stored fields, the name and email, a signed URL for the photo
 * (never the storage key), and the summary. It never includes coach notes: those live in `coach_notes` and are only
 * read by coach-only endpoints.
 */
export const profileFor = (userId: string) =>
	Effect.gen(function* () {
		const profiles = yield* Profiles;
		const user = yield* (yield* Users).findById(userId);
		if (!user) return yield* new NotFound({ message: 'Player not found' });
		const [profile, summary] = yield* Effect.all([profiles.get(userId), profiles.summary(userId)]);
		const photoUrl = profile.photoKey ? (yield* (yield* R2).presignGet({ key: profile.photoKey })).url : null;
		return {
			userId,
			displayName: user.displayName,
			email: user.email,
			handicap: profile.handicap,
			goals: profile.goals,
			homeCourse: profile.homeCourse,
			hand: profile.hand,
			equipment: profile.equipment,
			limitations: profile.limitations,
			photoUrl,
			summary
		} satisfies ProfileDto;
	});

/** `GET /api/profile`: the signed-in player's own profile. */
export const getProfile = Effect.gen(function* () {
	const player = yield* requireRole('player');
	return yield* profileFor(player.id);
});

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());

/** `PUT /api/profile`: change the fields sent (null or empty clears one). The handicap is -10 to 54 (422 otherwise). */
export const updateProfile = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(UpdateProfileRequest);
	if (body.displayName !== undefined) yield* (yield* Users).setDisplayName(player.id, clean(body.displayName) ?? null);
	yield* (yield* Profiles).update(player.id, {
		handicap: body.handicap,
		goals: clean(body.goals),
		homeCourse: clean(body.homeCourse),
		hand: body.hand,
		equipment: clean(body.equipment),
		limitations: clean(body.limitations)
	});
	return yield* profileFor(player.id);
});

/**
 * `POST /api/profile/photo`: a presigned PUT for the player's own photo key (JPEG, PNG or WebP, up to 5 MB). Nothing
 * changes on the profile until `/complete` has checked the upload.
 */
export const requestPhotoUpload = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(PhotoUploadRequest);
	const key = keys.profilePhoto(player.id, PHOTO_TYPES[body.contentType]);
	const put = yield* (yield* R2).presignPut({ key, contentType: body.contentType, sizeBytes: body.sizeBytes });
	return { upload: { url: put.url, headers: put.headers, expiresAt: put.expiresAt.toISOString() } };
});

const PhotoDone = Schema.Struct({ contentType: PhotoUploadRequest.fields.contentType });

/** `POST /api/profile/photo/complete`: check the object really is in R2 (409 if not, or the wrong size), then use it. */
export const completePhotoUpload = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const body = yield* decodeBody(PhotoDone);
	const key = keys.profilePhoto(player.id, PHOTO_TYPES[body.contentType]);
	const head = yield* (yield* R2).head(key);
	if (!head) return yield* new Conflict({ message: 'The upload has not finished. Try again.' });
	if (head.sizeBytes <= 0 || head.sizeBytes > MAX_PHOTO_BYTES) return yield* new Conflict({ message: 'The uploaded photo is not a valid size.' });
	yield* (yield* Profiles).setPhotoKey(player.id, key);
	return yield* profileFor(player.id);
});
