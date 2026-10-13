import type { AnnotationShape } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE_MS, overlayIntervals } from './export-timeline';

const shape = (x: number): AnnotationShape => ({ v: 1, type: 'line', color: '#D4A017', width: 0.005, a: { x, y: 0.1 }, b: { x, y: 0.9 } });
const a = (startMs: number, endMs: number, x: number) => ({ startMs, endMs, shape: shape(x) });
const view = (iv: ReturnType<typeof overlayIntervals>) => iv.map((i) => [i.startMs, i.endMs, i.shapes.length]);

describe('overlayIntervals', () => {
	it('covers the whole video, with nothing visible where no annotation is', () => {
		expect(view(overlayIntervals([], 10_000))).toEqual([[0, 10_000, 0]]);
		expect(view(overlayIntervals([a(2_000, 4_000, 0.1)], 10_000))).toEqual([
			[0, 2_000, 0],
			[2_000, 4_001, 1], // the end is inclusive, so it stays up through its last millisecond
			[4_001, 10_000, 0]
		]);
	});

	it('stacks annotations that overlap, in the order given, and splits at each start and end', () => {
		const iv = overlayIntervals([a(1_000, 5_000, 0.1), a(3_000, 8_000, 0.2)], 10_000);
		expect(view(iv)).toEqual([
			[0, 1_000, 0],
			[1_000, 3_000, 1],
			[3_000, 5_001, 2],
			[5_001, 8_001, 1],
			[8_001, 10_000, 0]
		]);
		expect((iv[2]!.shapes[0] as { a: { x: number } }).a.x).toBe(0.1);
		expect((iv[2]!.shapes[1] as { a: { x: number } }).a.x).toBe(0.2);
	});

	it('keeps a one-frame note visible for about a frame, and clips to the video', () => {
		const [, shown] = overlayIntervals([a(2_400, 2_400, 0.1)], 10_000);
		expect(shown!.endMs - shown!.startMs).toBe(MIN_VISIBLE_MS);
		expect(view(overlayIntervals([a(9_000, 20_000, 0.1), a(12_000, 13_000, 0.1)], 10_000))).toEqual([
			[0, 9_000, 0],
			[9_000, 10_000, 1]
		]);
	});

	it('intervals are contiguous', () => {
		const iv = overlayIntervals([a(500, 700, 0.1), a(600, 2_000, 0.3), a(1_900, 3_000, 0.5)], 4_000);
		for (let i = 1; i < iv.length; i++) expect(iv[i]!.startMs).toBe(iv[i - 1]!.endMs);
		expect(iv[0]!.startMs).toBe(0);
		expect(iv.at(-1)!.endMs).toBe(4_000);
	});
});
