import { describe, expect, it } from 'vitest';
import { CommentarySync, activeSegment, clipTime, type ClipTarget, type CommentarySegment } from './commentary-sync';

class FakeClip implements ClipTarget {
	t = 0;
	isPaused = true;
	r = 1;
	seeks: number[] = [];
	plays = 0;
	currentMs = () => this.t;
	seekMs(ms: number) {
		this.t = ms;
		this.seeks.push(ms);
	}
	paused = () => this.isPaused;
	play() {
		this.isPaused = false;
		this.plays++;
	}
	pause() {
		this.isPaused = true;
	}
	rate = () => this.r;
	setRate(r: number) {
		this.r = r;
	}
}

const seg = (id: string, startMs: number, endMs: number, clipStartMs = 0, url = id): CommentarySegment => ({ id, startMs, endMs, clipStartMs, hasVideo: false, url });
const build = (segments: CommentarySegment[]) => {
	const clips = new Map<string, FakeClip>();
	const sync = new CommentarySync(segments, (s) => {
		if (!clips.has(s.url)) clips.set(s.url, new FakeClip());
		return clips.get(s.url)!;
	});
	return { sync, clips, clip: (url: string) => clips.get(url)! };
};

describe('activeSegment / clipTime', () => {
	const segs = [seg('a', 0, 10_000), seg('b', 15_000, 30_000, 15_000)];
	it('start is inclusive, end exclusive, and gaps have none', () => {
		expect(activeSegment(segs, 0)?.id).toBe('a');
		expect(activeSegment(segs, 9_999)?.id).toBe('a');
		expect(activeSegment(segs, 10_000)).toBeUndefined();
		expect(activeSegment(segs, 15_000)?.id).toBe('b');
		expect(activeSegment(segs, 30_000)).toBeUndefined();
	});
	it('maps the timeline into the clip, including a trimmed piece', () => {
		expect(clipTime(segs[1]!, 20_000)).toBe(20_000); // piece of a clip that starts 15 s in: timeline 20 s is clip 20 s
		expect(clipTime(seg('x', 10_000, 15_000, 0), 12_000)).toBe(2_000); // a fresh recording starts at 0 of its clip
	});
});

describe('CommentarySync', () => {
	it('plays the active clip at the right place while the video plays, and pauses with it', () => {
		const { sync, clip } = build([seg('a', 2_000, 8_000)]);
		sync.update(3_000, true, 1);
		expect(clip('a').t).toBe(1_000);
		expect(clip('a').isPaused).toBe(false);
		sync.update(3_100, false, 1);
		expect(clip('a').isPaused).toBe(true);
	});

	it('does not move a clip that is close enough (no stutter), but does when it drifts', () => {
		const { sync, clip } = build([seg('a', 0, 10_000)]);
		sync.update(1_000, true, 1);
		clip('a').seeks.length = 0;
		clip('a').t = 1_100; // 100 ms ahead of 1000: fine
		sync.update(1_000, true, 1);
		expect(clip('a').seeks).toEqual([]);
		clip('a').t = 1_600;
		sync.update(1_000, true, 1);
		expect(clip('a').seeks).toEqual([1_000]);
	});

	it('exact moves it even when it is only a little off (after a seek)', () => {
		const { sync, clip } = build([seg('a', 0, 10_000)]);
		sync.update(1_000, false, 1);
		clip('a').t = 1_080;
		sync.update(1_000, false, 1, true);
		expect(clip('a').t).toBe(1_000);
	});

	it('is silent in a gap, and starts again where the next segment begins', () => {
		const { sync, clip } = build([seg('a', 0, 5_000), seg('b', 8_000, 12_000)]);
		sync.update(1_000, true, 1);
		expect(clip('a').isPaused).toBe(false);
		sync.update(6_000, true, 1); // the gap
		expect(clip('a').isPaused).toBe(true);
		sync.update(8_000, true, 1);
		expect(clip('b').isPaused).toBe(false);
		expect(clip('b').t).toBe(0);
	});

	it('switching segments pauses the old clip and starts the new one', () => {
		const { sync, clip } = build([seg('a', 0, 5_000), seg('b', 5_000, 10_000)]);
		sync.update(4_900, true, 1);
		sync.update(5_000, true, 1);
		expect(clip('a').isPaused).toBe(true);
		expect(clip('b').isPaused).toBe(false);
		expect(clip('b').t).toBe(0);
	});

	it('pieces cut from one recording share a clip and follow its offsets', () => {
		const pieces = [seg('p1', 0, 10_000, 0, 'take'), seg('mid', 10_000, 15_000, 0, 'new'), seg('p2', 15_000, 30_000, 15_000, 'take')];
		const { sync, clip } = build(pieces);
		sync.update(16_000, true, 1);
		expect(clip('take').t).toBe(16_000);
		sync.update(12_000, true, 1);
		expect(clip('take').isPaused).toBe(true);
		expect(clip('new').t).toBe(2_000);
		sync.update(2_000, true, 1);
		expect(clip('take').isPaused).toBe(false);
		expect(clip('take').t).toBe(2_000);
	});

	it('carries the playback rate', () => {
		const { sync, clip } = build([seg('a', 0, 10_000)]);
		sync.update(1_000, true, 0.5);
		expect(clip('a').r).toBe(0.5);
	});

	it('stop() silences every clip', () => {
		const { sync, clip } = build([seg('a', 0, 5_000)]);
		sync.update(1_000, true, 1);
		sync.stop();
		expect(clip('a').isPaused).toBe(true);
	});
});
