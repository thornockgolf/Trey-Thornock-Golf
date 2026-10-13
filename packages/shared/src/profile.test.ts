import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES, PhotoUploadRequest, UpdateProfileRequest, subscriptionLabel } from './profile';

describe('UpdateProfileRequest', () => {
	const decode = Schema.decodeUnknownSync(UpdateProfileRequest);
	it('accepts the handicap range -10 to 54 and decimals', () => {
		for (const h of [-10, -3.5, 0, 18.4, 54]) expect(decode({ handicap: h }).handicap).toBe(h);
	});
	it.each([[-10.1], [54.1], [100], [NaN], [Infinity]])('rejects handicap %s', (h) => {
		expect(() => decode({ handicap: h })).toThrow();
	});
	it('null clears a field, and a missing field is simply absent', () => {
		expect(decode({ goals: null, hand: null })).toEqual({ goals: null, hand: null });
		expect(decode({})).toEqual({});
	});
	it('limits hand and text lengths, and strips unknown fields', () => {
		expect(() => decode({ hand: 'both' })).toThrow();
		expect(() => decode({ goals: 'x'.repeat(1001) })).toThrow();
		expect(() => decode({ displayName: 'x'.repeat(81) })).toThrow();
		expect((decode({ handicap: 5, role: 'coach' }) as any).role).toBeUndefined();
	});
});

describe('PhotoUploadRequest', () => {
	const decode = Schema.decodeUnknownSync(PhotoUploadRequest);
	it('takes images up to the limit only', () => {
		expect(decode({ contentType: 'image/png', sizeBytes: 1000 }).contentType).toBe('image/png');
		expect(() => decode({ contentType: 'image/gif', sizeBytes: 1000 })).toThrow();
		expect(() => decode({ contentType: 'video/mp4', sizeBytes: 1000 })).toThrow();
		expect(() => decode({ contentType: 'image/jpeg', sizeBytes: MAX_PHOTO_BYTES + 1 })).toThrow();
		expect(() => decode({ contentType: 'image/jpeg', sizeBytes: 0 })).toThrow();
	});
});

describe('subscriptionLabel', () => {
	it('is plain language', () => {
		expect(subscriptionLabel(null)).toBe('No subscription');
		expect(subscriptionLabel('active')).toBe('Active');
		expect(subscriptionLabel('past_due')).toBe('Payment needed');
		expect(subscriptionLabel('incomplete')).toBe('Not active');
	});
});
