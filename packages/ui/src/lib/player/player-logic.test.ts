import { describe, expect, it } from 'vitest';
import {
	PLAYBACK_RATES,
	formatRate,
	needsSilencing,
	snapRate,
	canRefresh,
	cueAt,
	formatClock,
	stageRatio,
	frameAt,
	isExpired,
	isRefreshableMediaError,
	parseSpriteVtt,
	stepTime
} from './player-logic';

describe('stepTime', () => {
	it('advances exactly one frame (1/60 s) per step at 60 fps', () => {
		let t = stepTime(0, 60, 1, 10);
		const first = t;
		for (let i = 0; i < 5; i++) {
			const next = stepTime(t, 60, 1, 10);
			expect(next - t).toBeCloseTo(1 / 60, 9);
			t = next;
		}
		expect(frameAt(first, 60)).toBe(1);
		expect(frameAt(t, 60)).toBe(6);
	});

	it('goes back one frame and clamps at the start and end', () => {
		const t = stepTime(stepTime(0, 30, 1, 3), 30, 1, 3);
		expect(frameAt(stepTime(t, 30, -1, 3), 30)).toBe(1);
		expect(stepTime(0, 30, -1, 3)).toBeLessThan(1 / 30);
		expect(frameAt(stepTime(2.99, 30, 5, 3), 30)).toBe(89);
		expect(stepTime(2.99, 30, 5, 3)).toBeLessThanOrEqual(3);
	});

	it('does not slip a frame at 29.97 fps (boundaries are not representable)', () => {
		const fps = 30000 / 1001;
		let t = 0;
		for (let i = 1; i <= 300; i++) {
			t = stepTime(t, fps, 1, 60);
			expect(frameAt(t, fps)).toBe(i);
		}
	});

	it('steps from a frame boundary reported slightly early', () => {
		// 3 / 60 reported as 0.04999999 must still be frame 3
		expect(frameAt(0.04999999, 60)).toBe(3);
		expect(frameAt(stepTime(0.04999999, 60, 1, 10), 60)).toBe(4);
	});

	it('only clamps when fps is unknown', () => {
		expect(stepTime(1.5, 0, 1, 10)).toBe(1.5);
		expect(stepTime(20, 0, 1, 10)).toBe(10);
	});
});

describe('formatClock', () => {
	it.each([
		[0, '0:00.00'],
		[1.234, '0:01.23'],
		[65.5, '1:05.50'],
		[3725.01, '1:02:05.01'],
		[NaN, '0:00.00'],
		[-3, '0:00.00']
	])('%s -> %s', (s, out) => expect(formatClock(s)).toBe(out));
});

const VTT = `WEBVTT

00:00:00.000 --> 00:00:00.500
sprite.jpg#xywh=0,0,160,90

00:00:00.500 --> 00:00:01.000
sprite.jpg#xywh=160,0,160,90

00:00:01.000 --> 00:00:01.250
sprite.jpg#xywh=320,0,160,90
`;

describe('sprite cues', () => {
	it('parses the worker VTT', () => {
		const cues = parseSpriteVtt(VTT);
		expect(cues).toHaveLength(3);
		expect(cues[1]).toEqual({ startMs: 500, endMs: 1000, x: 160, y: 0, w: 160, h: 90 });
	});

	it('handles CRLF, hours and skips malformed cues', () => {
		const cues = parseSpriteVtt('WEBVTT\r\n\r\n01:00:00.000 --> 01:00:00.500\r\nsprite.jpg#xywh=1,2,3,4\r\n\r\nnonsense --> x\r\nnope\r\n');
		expect(cues).toEqual([{ startMs: 3_600_000, endMs: 3_600_500, x: 1, y: 2, w: 3, h: 4 }]);
	});

	it('finds the cue for a time, clamping outside the range', () => {
		const cues = parseSpriteVtt(VTT);
		expect(cueAt(cues, 0)?.x).toBe(0);
		expect(cueAt(cues, 499)?.x).toBe(0);
		expect(cueAt(cues, 500)?.x).toBe(160);
		expect(cueAt(cues, 1100)?.x).toBe(320);
		expect(cueAt(cues, 99_999)?.x).toBe(320);
		expect(cueAt(cues, -5)?.x).toBe(0);
		expect(cueAt([], 10)).toBeUndefined();
	});
});

describe('signed URL refresh', () => {
	it('isExpired uses a margin and treats unknown as fresh', () => {
		const now = Date.parse('2026-10-12T12:00:00Z');
		expect(isExpired('2026-10-12T12:00:30Z', now)).toBe(true);
		expect(isExpired('2026-10-12T12:05:00Z', now)).toBe(false);
		expect(isExpired(undefined, now)).toBe(false);
		expect(isExpired('', now)).toBe(false);
	});

	it('allows 3 refreshes per minute', () => {
		expect(canRefresh([], 100_000)).toBe(true);
		expect(canRefresh([90_000, 91_000], 100_000)).toBe(true);
		expect(canRefresh([90_000, 91_000, 92_000], 100_000)).toBe(false);
		expect(canRefresh([10_000, 11_000, 12_000], 100_000)).toBe(true);
	});

	it('refreshes for network and source errors only', () => {
		expect([1, 2, 3, 4, undefined].map((c) => isRefreshableMediaError(c))).toEqual([false, true, false, true, false]);
	});
});

describe('playback speed', () => {
	it('offers exactly 0.25x, 0.5x, 0.75x and 1x', () => {
		expect([...PLAYBACK_RATES]).toEqual([0.25, 0.5, 0.75, 1]);
		expect(PLAYBACK_RATES.map(formatRate)).toEqual(['0.25x', '0.5x', '0.75x', '1x']);
	});
	it('snaps outside values to an allowed speed', () => {
		expect(snapRate(0.5)).toBe(0.5);
		expect(snapRate(2)).toBe(1);
		expect(snapRate(0.1)).toBe(0.25);
		expect(snapRate(0.6)).toBe(0.5);
		expect(snapRate(Number.NaN)).toBe(1);
		expect(snapRate(0)).toBe(1);
	});
});

describe('original sound', () => {
	it('needs silencing unless muted at volume 0', () => {
		expect(needsSilencing({ muted: true, volume: 0 })).toBe(false);
		expect(needsSilencing({ muted: false, volume: 0 })).toBe(true);
		expect(needsSilencing({ muted: true, volume: 1 })).toBe(true);
	});
});

describe('stageRatio', () => {
	it('uses the video shape, portrait included', () => {
		expect(stageRatio(1080, 1920)).toBeCloseTo(0.5625);
		expect(stageRatio(1920, 1080)).toBeCloseTo(16 / 9);
	});
	it('falls back to 16:9 when the size is unknown', () => {
		expect(stageRatio(0, 0)).toBeCloseTo(16 / 9);
		expect(stageRatio(undefined, null)).toBeCloseTo(16 / 9);
	});
	it('keeps absurd shapes in bounds', () => {
		expect(stageRatio(100, 1000)).toBe(0.4);
		expect(stageRatio(1000, 100)).toBe(2.5);
	});
});
