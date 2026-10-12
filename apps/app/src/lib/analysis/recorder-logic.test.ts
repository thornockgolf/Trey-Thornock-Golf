import { describe, expect, it } from 'vitest';
import { barLayout, baseType, formatElapsed, formatMs, mediaErrorMessage, pickRecorderType, rangeProblem, recorderBitrates, takeRange } from './recorder-logic';

describe('pickRecorderType', () => {
	it('prefers WebM/Opus where it can (Chrome, Firefox)', () => {
		const chrome = (m: string) => m.startsWith('audio/webm') || m.startsWith('video/webm');
		expect(pickRecorderType(false, chrome)).toEqual({ mimeType: 'audio/webm;codecs=opus', contentType: 'audio/webm' });
		expect(pickRecorderType(true, chrome)).toEqual({ mimeType: 'video/webm;codecs=vp9,opus', contentType: 'video/webm' });
	});
	it('falls back to MP4 (Safari)', () => {
		const safari = (m: string) => m.startsWith('audio/mp4') || m.startsWith('video/mp4');
		expect(pickRecorderType(false, safari)?.contentType).toBe('audio/mp4');
		expect(pickRecorderType(true, safari)?.contentType).toBe('video/mp4');
	});
	it('says so when nothing is supported', () => {
		expect(pickRecorderType(false, () => false)).toBeUndefined();
	});
	it('only offers types the server accepts', () => {
		const seen: string[] = [];
		pickRecorderType(true, (m) => (seen.push(baseType(m)), false));
		pickRecorderType(false, (m) => (seen.push(baseType(m)), false));
		expect(new Set(seen)).toEqual(new Set(['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/ogg']));
	});
});

describe('baseType', () => {
	it('drops the codecs and normalizes case', () => {
		expect(baseType('Audio/WebM;codecs=opus')).toBe('audio/webm');
		expect(baseType('video/mp4')).toBe('video/mp4');
	});
});

describe('rangeProblem', () => {
	it('accepts a good range and explains a bad one', () => {
		expect(rangeProblem({ startMs: 1000, endMs: 5000 }, 10_000)).toBeUndefined();
		expect(rangeProblem({ startMs: 1000, endMs: 1100 }, 10_000)).toMatch(/too short/);
		expect(rangeProblem({ startMs: 1000, endMs: 11_000 }, 10_000)).toMatch(/past the end/);
		expect(rangeProblem({ startMs: -5, endMs: 1000 }, 10_000)).toMatch(/inside the video/);
		expect(rangeProblem({ startMs: 0.5, endMs: 1000 }, 10_000)).toMatch(/inside the video/);
	});
});

describe('takeRange', () => {
	it('is where the video was when recording started and stopped, clamped to the video', () => {
		expect(takeRange(2400.4, 9100.6, 30_000)).toEqual({ startMs: 2400, endMs: 9101 });
		expect(takeRange(-3, 31_000, 30_000)).toEqual({ startMs: 0, endMs: 30_000 });
	});
});

describe('barLayout', () => {
	it('puts segments on a bar by percent and keeps tiny ones visible', () => {
		const bar = barLayout([{ id: 'a', startMs: 0, endMs: 10_000 }, { id: 'b', startMs: 15_000, endMs: 15_010 }], 30_000);
		expect(bar[0]).toMatchObject({ left: 0 });
		expect(bar[0]!.width).toBeCloseTo(33.33, 1);
		expect(bar[1]!.left).toBeCloseTo(50);
		expect(bar[1]!.width).toBe(0.5);
		expect(barLayout([], 0)).toEqual([]);
	});
});

describe('formatting', () => {
	it('formats positions in tenths and elapsed time in seconds', () => {
		expect(formatMs(0)).toBe('0:00.0');
		expect(formatMs(2400)).toBe('0:02.4');
		expect(formatMs(65_320)).toBe('1:05.3');
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(61_999)).toBe('1:01');
	});
	it('bitrates stay modest', () => {
		expect(recorderBitrates(false)).toEqual({ audioBitsPerSecond: 64_000 });
		expect(recorderBitrates(true).videoBitsPerSecond).toBeLessThanOrEqual(1_000_000);
	});
});

describe('mediaErrorMessage', () => {
	it('tells the coach what to do', () => {
		expect(mediaErrorMessage({ name: 'NotAllowedError' }, false)).toMatch(/Allow the microphone/);
		expect(mediaErrorMessage({ name: 'NotAllowedError' }, true)).toMatch(/microphone and camera/);
		expect(mediaErrorMessage({ name: 'NotFoundError' }, true)).toMatch(/camera off/);
		expect(mediaErrorMessage({ name: 'NotReadableError' }, false)).toMatch(/Another app/);
		expect(mediaErrorMessage(new Error('x'), false)).toMatch(/could not start/);
	});
});
