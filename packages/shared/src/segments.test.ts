import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { keys } from './storage';
import { CreateSegmentRequest, MAX_SEGMENT_BYTES, overlaps, planReplace, type TimelineSegment } from './segments';

const seg = (id: string, startMs: number, endMs: number, clipStartMs = 0): TimelineSegment => ({ id, startMs, endMs, clipStartMs });
const A = '00000000-0000-4000-8000-00000000000a';
const S = '00000000-0000-4000-8000-00000000000b';

describe('overlaps', () => {
	it('shares time, and touching ends do not count', () => {
		expect(overlaps({ startMs: 0, endMs: 10 }, 5, 15)).toBe(true);
		expect(overlaps({ startMs: 0, endMs: 10 }, 10, 15)).toBe(false);
		expect(overlaps({ startMs: 10, endMs: 20 }, 0, 10)).toBe(false);
		expect(overlaps({ startMs: 0, endMs: 30 }, 10, 15)).toBe(true);
	});
});

describe('planReplace', () => {
	it('replaces only the segments that overlap, leaving the others out of the plan', () => {
		const live = [seg('a', 0, 10_000), seg('b', 10_000, 15_000), seg('c', 15_000, 30_000)];
		expect(planReplace(live, 10_000, 15_000)).toEqual({ replaced: ['b'], trims: [] });
	});

	it('splits a segment that is re-recorded in the middle into two trimmed pieces of the same clip', () => {
		const live = [seg('take', 0, 30_000)];
		const plan = planReplace(live, 10_000, 15_000);
		expect(plan.replaced).toEqual(['take']);
		expect(plan.trims).toEqual([
			{ from: 'take', startMs: 0, endMs: 10_000, clipStartMs: 0 },
			{ from: 'take', startMs: 15_000, endMs: 30_000, clipStartMs: 15_000 }
		]);
	});

	it('keeps the clip offset when a trimmed piece is trimmed again', () => {
		// the right-hand piece of the previous split starts 15 s into its clip
		const live = [seg('p1', 0, 10_000), seg('p2', 15_000, 30_000, 15_000)];
		const plan = planReplace(live, 20_000, 25_000);
		expect(plan.replaced).toEqual(['p2']);
		expect(plan.trims).toEqual([
			{ from: 'p2', startMs: 15_000, endMs: 20_000, clipStartMs: 15_000 },
			{ from: 'p2', startMs: 25_000, endMs: 30_000, clipStartMs: 25_000 }
		]);
	});

	it('trims one side when the range overlaps the end of one segment and the start of the next', () => {
		const live = [seg('a', 0, 12_000), seg('b', 12_000, 30_000)];
		const plan = planReplace(live, 10_000, 15_000);
		expect(plan.replaced).toEqual(['a', 'b']);
		expect(plan.trims).toEqual([
			{ from: 'a', startMs: 0, endMs: 10_000, clipStartMs: 0 },
			{ from: 'b', startMs: 15_000, endMs: 30_000, clipStartMs: 3_000 }
		]);
	});

	it('a range in a gap or past the end replaces nothing', () => {
		const live = [seg('a', 0, 5_000), seg('b', 20_000, 30_000)];
		expect(planReplace(live, 5_000, 20_000)).toEqual({ replaced: [], trims: [] });
		expect(planReplace(live, 30_000, 40_000)).toEqual({ replaced: [], trims: [] });
	});

	it('a range that covers whole segments leaves no trims', () => {
		expect(planReplace([seg('a', 5_000, 10_000)], 0, 20_000)).toEqual({ replaced: ['a'], trims: [] });
	});

	it('every moment of the old timeline is covered exactly once afterwards', () => {
		const live = [seg('a', 0, 12_000), seg('b', 12_000, 30_000)];
		const plan = planReplace(live, 10_000, 15_000);
		const kept = live.filter((s) => !plan.replaced.includes(s.id));
		const pieces = [...kept, ...plan.trims.map((t) => ({ startMs: t.startMs, endMs: t.endMs })), { startMs: 10_000, endMs: 15_000 }];
		const sorted = [...pieces].sort((x, y) => x.startMs - y.startMs);
		expect(sorted[0]!.startMs).toBe(0);
		for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.startMs).toBe(sorted[i - 1]!.endMs);
		expect(sorted.at(-1)!.endMs).toBe(30_000);
	});
});

describe('CreateSegmentRequest', () => {
	const ok = { startMs: 10_000, endMs: 15_000, contentType: 'audio/webm', sizeBytes: 5_000 };
	it('accepts a recording and the optional annotations choice', () => {
		expect(Schema.decodeUnknownSync(CreateSegmentRequest)(ok)).toEqual(ok);
		expect(Schema.decodeUnknownSync(CreateSegmentRequest)({ ...ok, annotations: 'remove' }).annotations).toBe('remove');
	});
	it.each([
		['a non-recording type', { contentType: 'image/png' }],
		['too big', { sizeBytes: MAX_SEGMENT_BYTES + 1 }],
		['empty', { sizeBytes: 0 }],
		['fractional ms', { startMs: 1.5 }],
		['unknown annotations choice', { annotations: 'delete' }]
	])('rejects %s', (_n, patch) => {
		expect(() => Schema.decodeUnknownSync(CreateSegmentRequest)({ ...ok, ...patch })).toThrow();
	});
});

describe('segment keys', () => {
	it('puts the raw recording next to the normalized clip', () => {
		expect(keys.analysisSegmentRaw(A, S, 'webm')).toBe(`analysis/${A}/${S}.raw.webm`);
		expect(keys.analysisSegment(A, S)).toBe(`analysis/${A}/${S}.mp4`);
		expect(() => keys.analysisSegmentRaw(A, '../x', 'webm')).toThrow();
		expect(() => keys.analysisSegmentRaw(A, S, 'exe' as never)).toThrow();
	});
});
