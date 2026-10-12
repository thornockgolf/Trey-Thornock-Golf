import { Effect, Exit, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import {
	FfmpegError,
	keyframeInterval,
	outputFrameRate,
	parseProbe,
	run,
	spriteLayout,
	spriteVtt,
	targetSize
} from './ffmpeg';

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const waitDead = async (pid: number) => {
	for (let i = 0; i < 50 && alive(pid); i++) await new Promise((r) => setTimeout(r, 20));
	return !alive(pid);
};
const endless = ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-f', 'null', '-'];

describe('targetSize', () => {
	it('keeps sizes within 1080p, never upscales, keeps even dimensions', () => {
		expect(targetSize(1280, 720)).toEqual({ width: 1280, height: 720 });
		expect(targetSize(1920, 1080)).toEqual({ width: 1920, height: 1080 });
		expect(targetSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
		expect(targetSize(2160, 3840)).toEqual({ width: 1080, height: 1920 }); // portrait 4K
		expect(targetSize(1440, 1440)).toEqual({ width: 1080, height: 1080 });
		expect(targetSize(641, 359)).toEqual({ width: 642, height: 360 });
		const w = targetSize(4000, 3000); // 4:3 is limited by the height
		expect(w.height).toBe(1080);
		expect(w.width).toBe(1440);
	});
});

describe('outputFrameRate and keyframeInterval', () => {
	it('snaps near-standard (VFR) rates and keeps exact NTSC rates', () => {
		expect(outputFrameRate(30)).toEqual({ arg: '30', value: 30 });
		expect(outputFrameRate(29.97003)).toEqual({ arg: '30000/1001', value: 29.97 });
		expect(outputFrameRate(29.83).arg).toBe('30000/1001');
		expect(outputFrameRate(59.6).arg).toBe('60000/1001');
		expect(outputFrameRate(240).arg).toBe('240');
		expect(outputFrameRate(1000)).toEqual({ arg: '240', value: 240 });
		expect(outputFrameRate(17.2)).toEqual({ arg: '17', value: 17 });
		expect(outputFrameRate(undefined)).toEqual({ arg: '30', value: 30 });
		expect(outputFrameRate(0)).toEqual({ arg: '30', value: 30 });
	});
	it('puts a keyframe every half second', () => {
		expect(keyframeInterval(outputFrameRate(30))).toBe(15);
		expect(keyframeInterval(outputFrameRate(29.97))).toBe(15);
		expect(keyframeInterval(outputFrameRate(60))).toBe(30);
		expect(keyframeInterval(outputFrameRate(59.94))).toBe(30);
		expect(keyframeInterval(outputFrameRate(240))).toBe(120);
		expect(keyframeInterval(outputFrameRate(25))).toBe(12);
		expect(keyframeInterval(outputFrameRate(24))).toBe(12);
		expect(keyframeInterval(outputFrameRate(1))).toBe(1);
	});
});

describe('parseProbe', () => {
	const json = (streams: object[], duration?: string) => JSON.stringify({ streams, format: duration ? { duration } : {} });
	it('reads duration (integer ms), fps, size and streams', () => {
		const p = parseProbe(
			json(
				[
					{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30000/1001', pix_fmt: 'yuv420p' },
					{ codec_type: 'audio', codec_name: 'aac' }
				],
				'4.0335'
			)
		);
		expect(p).toMatchObject({ durationMs: 4034, hasVideo: true, hasAudio: true, width: 1920, height: 1080, videoCodec: 'h264' });
		expect(p.fps).toBeCloseTo(29.97, 2);
	});
	it('swaps width and height for a 90 degree rotation, applies the pixel aspect ratio', () => {
		expect(parseProbe(json([{ codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }])).width).toBe(1080);
		expect(parseProbe(json([{ codec_type: 'video', width: 1920, height: 1080, tags: { rotate: '270' } }])).height).toBe(1920);
		expect(parseProbe(json([{ codec_type: 'video', width: 1440, height: 1080, sample_aspect_ratio: '4:3' }])).width).toBe(1920);
	});
	it('does not count cover art as video, and tolerates a missing duration', () => {
		const p = parseProbe(json([{ codec_type: 'audio' }, { codec_type: 'video', width: 600, height: 600, disposition: { attached_pic: 1 } }]));
		expect(p.hasVideo).toBe(false);
		expect(p.durationMs).toBeUndefined();
		expect(parseProbe(json([], 'N/A')).durationMs).toBeUndefined();
	});
});

describe('sprite layout and VTT', () => {
	it('uses a tile per 0.5 s, and widens the interval for long clips', () => {
		const l = spriteLayout(4000, 1280, 720);
		expect(l).toEqual({ intervalMs: 500, count: 8, columns: 8, rows: 1, tileWidth: 160, tileHeight: 90 });
		const long = spriteLayout(300_000, 1920, 1080);
		expect(long.count).toBeLessThanOrEqual(300);
		expect(long.intervalMs).toBe(1000);
		expect(long.columns).toBe(10);
		expect(long.rows).toBe(30);
		expect(spriteLayout(4000, 720, 1280).tileHeight).toBe(284);
	});
	it('writes WebVTT cues that map time ranges to tiles', () => {
		const l = spriteLayout(12_300, 1280, 720); // 25 tiles, 10 per row
		const vtt = spriteVtt(l, 12_300);
		const lines = vtt.split('\n');
		expect(lines[0]).toBe('WEBVTT');
		expect(lines[1]).toBe('');
		expect(lines[2]).toBe('00:00:00.000 --> 00:00:00.500');
		expect(lines[3]).toBe('sprite.jpg#xywh=0,0,160,90');
		const cues = vtt.trim().split('\n\n').slice(1);
		expect(cues).toHaveLength(25);
		expect(cues[11]).toBe('00:00:05.500 --> 00:00:06.000\nsprite.jpg#xywh=160,90,160,90');
		expect(cues[24]).toBe('00:00:12.000 --> 00:00:12.300\nsprite.jpg#xywh=640,180,160,90');
	});
});

describe('run', () => {
	it('returns stdout', async () => {
		const out = await Effect.runPromise(run('ffprobe', ['-version'], { timeoutMs: 10_000 }));
		expect(out).toContain('ffprobe version');
	});

	it('fails with stderr on a non-zero exit, and when the binary is missing', async () => {
		const e = await Effect.runPromise(Effect.flip(run('ffprobe', ['/no/such/file.mp4'], { timeoutMs: 10_000 })));
		expect(e).toBeInstanceOf(FfmpegError);
		expect(e.timedOut).toBe(false);
		expect(e.stderr).toContain('No such file');
		const missing = await Effect.runPromise(Effect.flip(run('definitely-not-ffmpeg', [], { timeoutMs: 1000 })));
		expect(missing.message).toContain('could not start');
	});

	it('kills ffmpeg when it runs past the timeout', async () => {
		let pid = 0;
		const started = Date.now();
		const e = await Effect.runPromise(Effect.flip(run('ffmpeg', endless, { timeoutMs: 400, onSpawn: (p) => (pid = p) })));
		expect(e.timedOut).toBe(true);
		expect(e.message).toContain('timed out');
		expect(Date.now() - started).toBeLessThan(5000);
		expect(pid).toBeGreaterThan(0);
		expect(await waitDead(pid)).toBe(true);
	});

	it('kills ffmpeg when the effect is interrupted', async () => {
		let pid = 0;
		const exit = await Effect.runPromise(
			Effect.gen(function* () {
				const fiber = yield* Effect.forkChild(run('ffmpeg', endless, { timeoutMs: 60_000, onSpawn: (p) => (pid = p) }));
				yield* Effect.sleep('300 millis');
				yield* Fiber.interrupt(fiber);
				return yield* Fiber.await(fiber);
			})
		);
		expect(Exit.hasInterrupts(exit)).toBe(true);
		expect(pid).toBeGreaterThan(0);
		expect(await waitDead(pid)).toBe(true);
	});
});
