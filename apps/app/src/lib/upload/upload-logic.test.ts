import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_BYTES, type VideoDto } from '@ttg/shared';
import {
	HttpError,
	MissingEtagError,
	NetworkError,
	SpeedMeter,
	backoffMs,
	canRetry,
	contentTypeOf,
	errorMessage,
	formatBytes,
	formatSpeed,
	idle,
	isTransient,
	percentOf,
	planParts,
	transition,
	validateFile,
	type FileInfo,
	type UploadState
} from './upload-logic';

const file: FileInfo = { name: 'swing.mp4', sizeBytes: 1000, contentType: 'video/mp4' };
const video = { id: 'v1', status: 'uploaded' } as VideoDto;
const progress = (n: number) => ({ bytesUploaded: n, bytesTotal: 1000, percent: n / 10, speedBps: 100 });

describe('validateFile', () => {
	it('accepts MP4, MOV and WebM up to the limit', () => {
		expect(validateFile({ name: 'a.mp4', type: 'video/mp4', size: 10 })).toEqual({ ok: true, file: { name: 'a.mp4', sizeBytes: 10, contentType: 'video/mp4' } });
		expect(validateFile({ name: 'a.mov', type: 'video/quicktime', size: MAX_VIDEO_BYTES }).ok).toBe(true);
		expect(validateFile({ name: 'a.webm', type: 'video/webm', size: 1 }).ok).toBe(true);
	});

	it('falls back to the extension when the browser gives no type', () => {
		expect(contentTypeOf({ name: 'IMG_0001.MOV', type: '' })).toBe('video/quicktime');
		expect(contentTypeOf({ name: 'clip.mp4', type: 'application/octet-stream' })).toBe('video/mp4');
		expect(contentTypeOf({ name: 'clip.mp4', type: 'video/mp4; codecs=avc1' })).toBe('video/mp4');
	});

	it('rejects other types, even with a video extension', () => {
		const r = validateFile({ name: 'clip.3gp', type: 'video/3gpp', size: 10 });
		expect(r).toEqual({ ok: false, message: expect.stringContaining('MP4, MOV or WebM') });
		expect(validateFile({ name: 'notes.mp4', type: 'text/plain', size: 10 }).ok).toBe(false);
		expect(validateFile({ name: 'photo.jpg', type: '', size: 10 }).ok).toBe(false);
	});

	it('rejects empty and oversize files with a readable size', () => {
		expect(validateFile({ name: 'a.mp4', type: 'video/mp4', size: 0 })).toMatchObject({ ok: false, message: expect.stringContaining('empty') });
		const big = validateFile({ name: 'a.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 });
		expect(big).toMatchObject({ ok: false, message: expect.stringContaining('500 MB') });
	});
});

describe('transition', () => {
	const run = (events: Parameters<typeof transition>[1][], from: UploadState = idle) => events.reduce(transition, from);

	it('walks the happy path and only shows success after /complete', () => {
		let s = run([{ type: 'picked', file }, { type: 'start' }, { type: 'progress', progress: progress(400) }]);
		expect(s).toMatchObject({ kind: 'uploading', progress: { percent: 40 } });
		s = transition(s, { type: 'completed', video });
		expect(s.kind).toBe('uploading'); // bytes not done: a stray "completed" is ignored
		s = transition(s, { type: 'bytes-done' });
		expect(s.kind).toBe('finalizing');
		s = transition(s, { type: 'completed', video });
		expect(s).toMatchObject({ kind: 'success', video });
	});

	it('pauses and resumes, keeping progress and dropping speed', () => {
		const s = run([{ type: 'picked', file }, { type: 'start' }, { type: 'progress', progress: progress(300) }, { type: 'pause', reason: 'user' }]);
		expect(s).toMatchObject({ kind: 'paused', reason: 'user', progress: { bytesUploaded: 300, speedBps: null } });
		expect(transition(s, { type: 'resume' })).toMatchObject({ kind: 'uploading', progress: { bytesUploaded: 300 } });
	});

	it('lets a user pause override an offline pause', () => {
		const s = run([{ type: 'picked', file }, { type: 'start' }, { type: 'pause', reason: 'offline' }, { type: 'pause', reason: 'user' }]);
		expect(s).toMatchObject({ kind: 'paused', reason: 'user' });
		expect(transition(s, { type: 'pause', reason: 'offline' })).toMatchObject({ reason: 'user' });
	});

	it('records the failing stage and retries the right thing', () => {
		const up = run([{ type: 'picked', file }, { type: 'start' }, { type: 'progress', progress: progress(500) }, { type: 'failed', stage: 'upload', message: 'x' }]);
		expect(up).toMatchObject({ kind: 'error', stage: 'upload', progress: { bytesUploaded: 500 } });
		expect(canRetry(up)).toBe(true);
		expect(transition(up, { type: 'retry' })).toMatchObject({ kind: 'uploading', progress: { bytesUploaded: 500 } });

		const fin = run([{ type: 'picked', file }, { type: 'start' }, { type: 'bytes-done' }, { type: 'failed', stage: 'complete', message: 'x' }]);
		expect(fin).toMatchObject({ kind: 'error', stage: 'complete' });
		expect(transition(fin, { type: 'retry' }).kind).toBe('finalizing');
	});

	it('does not offer retry for a rejected file', () => {
		const s = transition(idle, { type: 'rejected', message: 'bad' });
		expect(s).toMatchObject({ kind: 'error', stage: 'validation', file: null });
		expect(canRetry(s)).toBe(false);
		expect(transition(s, { type: 'retry' })).toBe(s);
	});

	it('ignores picks and late callbacks at the wrong time', () => {
		const busy = run([{ type: 'picked', file }, { type: 'start' }]);
		expect(transition(busy, { type: 'picked', file: { ...file, name: 'b.mp4' } })).toBe(busy);
		expect(transition(idle, { type: 'progress', progress: progress(1) })).toBe(idle);
		expect(transition(idle, { type: 'failed', stage: 'upload', message: 'x' })).toBe(idle);
		const done = run([{ type: 'picked', file }, { type: 'start' }, { type: 'bytes-done' }, { type: 'completed', video }]);
		expect(transition(done, { type: 'failed', stage: 'complete', message: 'x' })).toBe(done);
	});
});

describe('retry policy', () => {
	it('backs off exponentially with a cap', () => {
		const none = () => 0;
		expect([1, 2, 3, 4, 5, 6].map((a) => backoffMs(a, none))).toEqual([1000, 2000, 4000, 8000, 15000, 15000]);
		expect(backoffMs(1, () => 1)).toBe(1200);
	});

	it('retries only network errors, 5xx, 408 and 429', () => {
		expect(isTransient(new NetworkError())).toBe(true);
		expect(isTransient(new HttpError(503, null, ''))).toBe(true);
		expect(isTransient(new HttpError(429, null, ''))).toBe(true);
		expect(isTransient(new HttpError(409, 'Conflict', ''))).toBe(false);
		expect(isTransient(new HttpError(403, null, '', 'storage'))).toBe(false);
		expect(isTransient(new Error('x'))).toBe(false);
	});
});

describe('errorMessage', () => {
	it('maps errors to messages a player can act on', () => {
		expect(errorMessage(new NetworkError())).toMatch(/connection/i);
		expect(errorMessage(new HttpError(409, 'Conflict', 'The upload has not finished. Try again.'), 'complete')).toMatch(/couldn't confirm/);
		expect(errorMessage(new HttpError(403, null, '', 'storage'))).toMatch(/expired/);
		expect(errorMessage(new HttpError(401, 'NotAuthenticated', ''))).toMatch(/Sign in/);
		expect(errorMessage(new HttpError(422, 'ValidationError', 'Expected ...'))).toMatch(/MP4, MOV or WebM/);
		expect(errorMessage(new HttpError(500, 'StorageError', 'Storage operation failed'))).toMatch(/our side/);
		expect(errorMessage(new MissingEtagError())).toMatch(/settings/);
	});

	it('never leaks raw server text for unknown errors', () => {
		expect(errorMessage(new Error('ECONNRESET at socket'))).toBe('The upload failed. Press Retry.');
	});
});

describe('planParts', () => {
	it('splits into fixed parts with a short last part', () => {
		expect(planParts(25, 10)).toEqual([
			{ partNumber: 1, start: 0, end: 10 },
			{ partNumber: 2, start: 10, end: 20 },
			{ partNumber: 3, start: 20, end: 25 }
		]);
		expect(planParts(20, 10)).toHaveLength(2);
	});
});

describe('SpeedMeter', () => {
	it('reports bytes per second over the window and resets when bytes go backwards', () => {
		const m = new SpeedMeter(5000);
		expect(m.sample(0, 0)).toBeNull();
		expect(m.sample(1000, 1000)).toBe(1000);
		expect(m.sample(3000, 2000)).toBe(1500);
		expect(m.sample(100, 2500)).toBeNull();
	});
});

describe('formatting', () => {
	it('formats sizes, speeds and percentages', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
		expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB');
		expect(formatSpeed(null)).toBe('');
		expect(formatSpeed(2 * 1024 * 1024)).toBe('2.0 MB/s');
		expect(percentOf(1, 3)).toBe(33);
		expect(percentOf(5, 0)).toBe(0);
	});
});
