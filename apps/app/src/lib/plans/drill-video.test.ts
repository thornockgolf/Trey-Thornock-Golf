import type { PlanSessionDto, VideoDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { choosableVideos, itemVideoLabel, videoCount, withItemVideo } from './drill-video';

const video = (id: string, over: Partial<VideoDto> = {}): VideoDto => ({
	id, kind: 'swing', status: 'ready', title: null, errorCode: null, durationMs: null, fps: null, width: null, height: null, sizeBytes: 1, createdAt: '2026-10-01T00:00:00Z', posterUrl: null, ...over
});
const session: PlanSessionDto = {
	id: 's', assignmentId: 'a', title: 'T', planTitle: null, scheduledOn: '2026-10-01', durationMin: 30, completedAt: null,
	items: [{ id: 'i1', drillId: 'd', name: 'A', minutes: 10, completedAt: null }, { id: 'i2', drillId: 'd', name: 'B', minutes: 20, completedAt: null }]
};

describe('choosableVideos', () => {
	it('keeps ready swing videos only, newest first', () => {
		const list = [
			video('old', { createdAt: '2026-09-01T00:00:00Z' }),
			video('new', { createdAt: '2026-10-05T00:00:00Z' }),
			video('proc', { status: 'processing' }),
			video('bad', { status: 'failed' }),
			video('ref', { kind: 'reference' })
		];
		expect(choosableVideos(list).map((v) => v.id)).toEqual(['new', 'old']);
	});
});

describe('withItemVideo', () => {
	it('sets and clears one drill\'s video without touching the others or completion', () => {
		const v = { id: 'v', status: 'ready' as const, title: 'x' };
		const a = withItemVideo(session, 'i2', v);
		expect(a.items[1]!.video).toEqual(v);
		expect(a.items[0]!.video).toBeUndefined();
		expect(videoCount(a)).toBe(1);
		const b = withItemVideo(a, 'i2', null);
		expect(b.items[1]!.video).toBeNull();
		expect(videoCount(b)).toBe(0);
		expect(b.completedAt).toBeNull();
		expect(session.items[1]!.video).toBeUndefined(); // original untouched
	});
});

describe('itemVideoLabel', () => {
	it('says what state the video is in', () => {
		expect(itemVideoLabel('ready')).toMatch(/ready/i);
		expect(itemVideoLabel('failed')).toMatch(/could not/i);
		expect(itemVideoLabel('processing')).toMatch(/getting ready/i);
		expect(itemVideoLabel('uploaded')).toMatch(/getting ready/i);
	});
});
