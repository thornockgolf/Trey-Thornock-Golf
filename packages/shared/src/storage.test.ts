import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { MAX_VIDEO_BYTES, PartNumber, VideoUploadRequest, keys, needsMultipart } from './storage';

const U = '123e4567-e89b-42d3-a456-426614174000';
const decode = <S extends Schema.Decoder<unknown, never>>(s: S, v: unknown) => Schema.decodeUnknownResult(s)(v);

describe('keys', () => {
	it('builds the layout from the spec', () => {
		expect(keys.rawSource(U, 'mp4')).toBe(`raw/${U}/source.mp4`);
		expect(keys.processedVideo(U)).toBe(`processed/${U}/video.mp4`);
		expect(keys.poster(U)).toBe(`processed/${U}/poster.jpg`);
		expect(keys.spriteVtt(U)).toBe(`processed/${U}/sprite.vtt`);
		expect(keys.analysisSegment(U, U)).toBe(`analysis/${U}/${U}.mp4`);
		expect(keys.profilePhoto(U, 'png')).toBe(`profile/${U}/photo.png`);
	});

	it('refuses ids and extensions that could alter the path', () => {
		expect(() => keys.rawSource('../../etc', 'mp4')).toThrow();
		expect(() => keys.rawSource(`${U}/../x`, 'mp4')).toThrow();
		expect(() => keys.rawSource(U, 'exe' as never)).toThrow();
		expect(() => keys.profilePhoto(U, 'svg' as never)).toThrow();
	});
});

describe('VideoUploadRequest', () => {
	it('accepts a valid request', () => {
		expect(decode(VideoUploadRequest, { contentType: 'video/mp4', sizeBytes: 1_000_000 })._tag).toBe('Success');
		expect(decode(VideoUploadRequest, { contentType: 'video/quicktime', sizeBytes: MAX_VIDEO_BYTES })._tag).toBe('Success');
	});

	it.each([
		['non-video type', { contentType: 'application/pdf', sizeBytes: 10 }],
		['too big', { contentType: 'video/mp4', sizeBytes: MAX_VIDEO_BYTES + 1 }],
		['zero bytes', { contentType: 'video/mp4', sizeBytes: 0 }],
		['fractional', { contentType: 'video/mp4', sizeBytes: 1.5 }],
		['missing size', { contentType: 'video/mp4' }]
	])('rejects %s', (_n, body) => {
		expect(decode(VideoUploadRequest, body)._tag).toBe('Failure');
	});
});

describe('PartNumber and multipart threshold', () => {
	it('allows 1..10000 only', () => {
		for (const ok of [1, 10_000]) expect(decode(PartNumber, ok)._tag).toBe('Success');
		for (const bad of [0, 10_001, 1.2, -1]) expect(decode(PartNumber, bad)._tag).toBe('Failure');
	});
	it('uses multipart from 50 MiB', () => {
		expect(needsMultipart(50 * 1024 * 1024 - 1)).toBe(false);
		expect(needsMultipart(50 * 1024 * 1024)).toBe(true);
	});
});
