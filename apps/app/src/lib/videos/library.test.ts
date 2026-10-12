import { describe, expect, it } from 'vitest';
import type { VideoDto, VideoStatus } from '@ttg/shared';
import { FAILED_MESSAGE, displayTitle, formatDuration, libraryVideos, shouldPoll, statusChip } from './library';

const v = (status: VideoStatus, extra: Partial<VideoDto> = {}) => ({ id: status, status, title: null, createdAt: '2026-10-12T15:00:00.000Z', ...extra }) as VideoDto;

describe('library helpers', () => {
	it('labels every status with text, not color alone', () => {
		expect(statusChip('ready')).toMatchObject({ label: 'Ready', tone: 'success' });
		expect(statusChip('processing').tone).toBe('warning');
		expect(statusChip('uploaded').tone).toBe('warning');
		expect(statusChip('failed')).toEqual({ label: 'Failed', tone: 'error', note: FAILED_MESSAGE });
		expect(FAILED_MESSAGE).toBe("We couldn't process this video. Try re-uploading.");
	});

	it('polls only while a video is uploaded or processing', () => {
		expect(shouldPoll([v('ready'), v('failed')])).toBe(false);
		expect(shouldPoll([v('ready'), v('processing')])).toBe(true);
		expect(shouldPoll([v('uploaded')])).toBe(true);
		expect(shouldPoll([v('pending')])).toBe(false);
		expect(shouldPoll([])).toBe(false);
	});

	it('hides unfinished (pending) uploads', () => {
		expect(libraryVideos([v('pending'), v('ready')]).map((x) => x.status)).toEqual(['ready']);
	});

	it('formats durations and falls back to a dated title', () => {
		expect(formatDuration(null)).toBeNull();
		expect(formatDuration(4_400)).toBe('0:04');
		expect(formatDuration(125_000)).toBe('2:05');
		expect(displayTitle(v('ready'))).toBe('Swing, Oct 12, 2026');
		expect(displayTitle(v('ready', { title: ' Driver ' }))).toBe('Driver');
	});
});
