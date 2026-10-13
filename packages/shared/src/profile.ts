import { Schema } from 'effect';

/** Player profile (spec 3.E.3). */

export const HANDICAP_MIN = -10;
export const HANDICAP_MAX = 54;
export const MAX_PROFILE_TEXT = 1000;

/** Profile photos: small images only, through the same presigned R2 flow as videos. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type PhotoContentType = keyof typeof PHOTO_TYPES;
export type PhotoExtension = (typeof PHOTO_TYPES)[PhotoContentType];

const Text = (max = MAX_PROFILE_TEXT) => Schema.String.pipe(Schema.check(Schema.isMaxLength(max)));

/**
 * `PUT /api/profile`: send the fields to change. A field set to `null` (or an empty string) is cleared; a field left
 * out is kept. The handicap is -10 to 54.
 */
export const UpdateProfileRequest = Schema.Struct({
	displayName: Schema.optional(Schema.NullOr(Text(80))),
	handicap: Schema.optional(Schema.NullOr(Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: HANDICAP_MIN, maximum: HANDICAP_MAX }))))),
	goals: Schema.optional(Schema.NullOr(Text())),
	homeCourse: Schema.optional(Schema.NullOr(Text(120))),
	hand: Schema.optional(Schema.NullOr(Schema.Literals(['left', 'right']))),
	equipment: Schema.optional(Schema.NullOr(Text())),
	limitations: Schema.optional(Schema.NullOr(Text()))
});
export type UpdateProfileRequest = typeof UpdateProfileRequest.Type;

/** `POST /api/profile/photo`: ask for a presigned upload. */
export const PhotoUploadRequest = Schema.Struct({
	contentType: Schema.Literals(Object.keys(PHOTO_TYPES) as [PhotoContentType, ...PhotoContentType[]]),
	sizeBytes: Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_PHOTO_BYTES })))
});
export type PhotoUploadRequest = typeof PhotoUploadRequest.Type;

export interface ProfileSummary {
	/** Ready swing videos. */
	readonly videos: number;
	/** The active plan assignment: its title and how many of its sessions are done. */
	readonly plan: { readonly title: string; readonly sessions: number; readonly sessionsDone: number } | null;
	/** The latest subscription's status from Stripe's webhooks (`active`, `past_due`, ...), or null when there is none. */
	readonly subscriptionStatus: string | null;
}

export interface ProfileDto {
	readonly userId: string;
	readonly displayName: string | null;
	readonly email: string | null;
	readonly handicap: number | null;
	readonly goals: string | null;
	readonly homeCourse: string | null;
	readonly hand: 'left' | 'right' | null;
	readonly equipment: string | null;
	readonly limitations: string | null;
	/** A short-lived signed URL, or null when there is no photo. */
	readonly photoUrl: string | null;
	readonly summary: ProfileSummary;
}

/** Subscription status in words for the profile summary. */
export const subscriptionLabel = (status: string | null) => {
	switch (status) {
		case null:
			return 'No subscription';
		case 'active':
		case 'trialing':
			return 'Active';
		case 'past_due':
		case 'unpaid':
			return 'Payment needed';
		case 'canceled':
			return 'Cancelled';
		default:
			return 'Not active';
	}
};
