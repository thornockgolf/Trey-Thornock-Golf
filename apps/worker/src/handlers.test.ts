import { describe, expect, it } from 'vitest';
import { concurrencyFromEnv, settingsFromEnv } from './handlers';
import { r2ConfigFromEnv } from './storage';

describe('worker settings', () => {
	it('WORKER_CONCURRENCY defaults to 1 and is capped at 2', () => {
		expect(concurrencyFromEnv(undefined)).toBe(1);
		expect(concurrencyFromEnv('')).toBe(1);
		expect(concurrencyFromEnv('abc')).toBe(1);
		expect(concurrencyFromEnv('0')).toBe(1);
		expect(concurrencyFromEnv('2')).toBe(2);
		expect(concurrencyFromEnv('8')).toBe(2);
	});

	it('reads WORK_DIR, FFMPEG_THREADS and FFMPEG_TIMEOUT_MS with defaults', () => {
		expect(settingsFromEnv({}).process).toMatchObject({ workDir: '/tmp/ttg-work', threads: 2 });
		const s = settingsFromEnv({ WORK_DIR: '/scratch', FFMPEG_THREADS: '3', FFMPEG_TIMEOUT_MS: '60000', WORKER_CONCURRENCY: '2' });
		expect(s).toMatchObject({ concurrency: 2, process: { workDir: '/scratch', threads: 3, transcodeTimeoutMs: 60_000 } });
	});

	it('names the missing R2 variables (never their values)', () => {
		expect(r2ConfigFromEnv({ R2_ENDPOINT: 'https://x', R2_BUCKET: 'b' })).toEqual({
			ok: false,
			missing: ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
		});
		const ok = r2ConfigFromEnv({ R2_ENDPOINT: 'https://x', R2_ACCESS_KEY_ID: 'a', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'b' });
		expect(ok.ok).toBe(true);
	});
});
