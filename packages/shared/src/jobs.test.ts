import { describe, expect, it } from 'vitest';
import { Schema } from 'effect';
import { JOB_CONFIG, JOB_NAMES, JobPayloads, singletonKey } from './jobs';

const U = '123e4567-e89b-42d3-a456-426614174000';
const ok = (name: keyof typeof JobPayloads, v: unknown) => Schema.decodeUnknownResult(JobPayloads[name] as Schema.Decoder<unknown, never>)(v)._tag === 'Success';

describe('jobs', () => {
	it('has a config for every job and the spec retry policy for the video job', () => {
		expect(Object.keys(JOB_CONFIG).sort()).toEqual([...JOB_NAMES].sort());
		expect(JOB_CONFIG['video.uploaded'].retryLimit).toBe(3);
		expect(JOB_CONFIG['retention.sweep'].cron).toBe('0 3 * * *');
	});

	it('validates payloads', () => {
		expect(ok('video.uploaded', { video_id: U })).toBe(true);
		expect(ok('video.uploaded', { video_id: 'nope' })).toBe(false);
		expect(ok('video.uploaded', {})).toBe(false);
		expect(ok('analysis.segment.uploaded', { analysis_id: U, segment_id: U })).toBe(true);
		expect(ok('retention.sweep', {})).toBe(true);
	});

	it('dedupes by entity id', () => {
		expect(singletonKey('video.uploaded', { video_id: U })).toBe(U);
		expect(singletonKey('retention.sweep', {})).toBeUndefined();
	});
});
