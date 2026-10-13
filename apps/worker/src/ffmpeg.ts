import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';

/**
 * ffmpeg/ffprobe helpers for the video pipeline (spec 3.C.2). Each call runs one child process with a
 * timeout; on timeout or interruption the process is killed. Uses node:child_process (works in Bun
 * and under Vitest's Node runner).
 */

/** A child process that exited non-zero, could not start, or ran past its timeout. */
export class FfmpegError extends Schema.TaggedError<FfmpegError>()('FfmpegError', {
	message: Schema.String,
	timedOut: Schema.Boolean,
	/** The last part of stderr, for logs. */
	stderr: Schema.String,
	pid: Schema.optional(Schema.Number)
}) {}

export interface RunOptions {
	readonly timeoutMs: number;
	/** Called with the pid once the process starts (tests use it to check the process is gone). */
	readonly onSpawn?: (pid: number) => void;
}

const STDERR_TAIL = 4000;

/** Run a command and collect stdout. Fails with FfmpegError on non-zero exit, spawn error or timeout. */
export const run = (cmd: string, args: readonly string[], options: RunOptions): Effect.Effect<string, FfmpegError> =>
	Effect.callback<string, FfmpegError>((resume) => {
		const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		const pid = child.pid;
		if (pid !== undefined) options.onSpawn?.(pid);
		const out: Buffer[] = [];
		let err = '';
		let timedOut = false;
		let done = false;
		child.stdout.on('data', (b: Buffer) => out.push(b));
		child.stderr.on('data', (b: Buffer) => {
			err = (err + b.toString()).slice(-STDERR_TAIL);
		});
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, options.timeoutMs);
		const finish = (e: Effect.Effect<string, FfmpegError>) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resume(e);
		};
		child.on('error', (e) =>
			finish(Effect.fail(new FfmpegError({ message: `${cmd} could not start: ${e.message}`, timedOut: false, stderr: err, pid })))
		);
		child.on('close', (code, signal) => {
			if (code === 0 && !timedOut) return finish(Effect.succeed(Buffer.concat(out).toString()));
			const why = timedOut ? `timed out after ${options.timeoutMs} ms` : signal ? `killed by ${signal}` : `exited with ${code}`;
			finish(Effect.fail(new FfmpegError({ message: `${cmd} ${why}`, timedOut, stderr: err, pid })));
		});
		// Interruption (job aborted, worker stopping) kills the process.
		return Effect.sync(() => {
			clearTimeout(timer);
			if (!done) child.kill('SIGKILL');
		});
	});

// ---------------------------------------------------------------------------------------------
// Probe

export interface ProbeResult {
	/** Integer milliseconds, or undefined when the container does not say. */
	readonly durationMs: number | undefined;
	readonly hasVideo: boolean;
	readonly hasAudio: boolean;
	/** Display size: rotation and non-square pixels applied. 0 when there is no video stream. */
	readonly width: number;
	readonly height: number;
	/** Frames per second as reported (average rate), or undefined. */
	readonly fps: number | undefined;
	readonly videoCodec: string | undefined;
	readonly audioCodec: string | undefined;
	/** Channels of the first audio stream (1 for a voice recording), or undefined. */
	readonly audioChannels: number | undefined;
	readonly pixFmt: string | undefined;
}

interface FfprobeStream {
	codec_type?: string;
	codec_name?: string;
	channels?: number;
	width?: number;
	height?: number;
	pix_fmt?: string;
	avg_frame_rate?: string;
	r_frame_rate?: string;
	sample_aspect_ratio?: string;
	duration?: string;
	disposition?: { attached_pic?: number };
	tags?: Record<string, string>;
	side_data_list?: { rotation?: number }[];
}
interface FfprobeJson {
	streams?: FfprobeStream[];
	format?: { duration?: string };
}

const ratio = (s: string | undefined): number | undefined => {
	if (!s) return undefined;
	const [n, d] = s.split(/[/:]/).map(Number);
	if (n === undefined || !Number.isFinite(n) || n <= 0) return undefined;
	if (d === undefined) return n;
	return Number.isFinite(d) && d > 0 ? n / d : undefined;
};

/** Parse `ffprobe -print_format json -show_format -show_streams` output. Pure, for tests. */
export const parseProbe = (json: string): ProbeResult => {
	const p = JSON.parse(json) as FfprobeJson;
	const streams = p.streams ?? [];
	// Cover art in an audio file is a "video" stream with attached_pic; it is not a video.
	const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic && (s.width ?? 0) > 0);
	const a = streams.find((s) => s.codec_type === 'audio');
	const seconds = Number(p.format?.duration ?? v?.duration);
	let width = v?.width ?? 0;
	let height = v?.height ?? 0;
	const sar = ratio(v?.sample_aspect_ratio);
	if (sar && sar !== 1) width = Math.round(width * sar);
	const rotation = v?.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? Number(v?.tags?.rotate ?? 0);
	if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
	return {
		durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined,
		hasVideo: v !== undefined,
		hasAudio: a !== undefined,
		width,
		height,
		fps: ratio(v?.avg_frame_rate) ?? ratio(v?.r_frame_rate),
		videoCodec: v?.codec_name,
		audioCodec: a?.codec_name,
		audioChannels: a?.channels,
		pixFmt: v?.pix_fmt
	};
};

export const probe = (path: string, timeoutMs = 60_000) =>
	run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { timeoutMs }).pipe(
		Effect.flatMap((out) =>
			Effect.try({
				try: () => parseProbe(out),
				catch: () => new FfmpegError({ message: 'ffprobe returned unreadable output', timedOut: false, stderr: out.slice(0, STDERR_TAIL) })
			})
		)
	);

// ---------------------------------------------------------------------------------------------
// Output decisions (pure)

/** The longest side and shortest side of the output are capped at 1920 and 1080 (1080p, either orientation). */
export const MAX_LONG_SIDE = 1920;
export const MAX_SHORT_SIDE = 1080;

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2));

/** Fit within 1080p keeping the aspect ratio, never upscale, even dimensions (needed for yuv420p). */
export const targetSize = (width: number, height: number): { width: number; height: number } => {
	const landscape = width >= height;
	const maxW = landscape ? MAX_LONG_SIDE : MAX_SHORT_SIDE;
	const maxH = landscape ? MAX_SHORT_SIDE : MAX_LONG_SIDE;
	const scale = Math.min(1, maxW / width, maxH / height);
	return { width: even(width * scale), height: even(height * scale) };
};

/** A frame rate as ffmpeg wants it (`30000/1001`) and as stored (29.97). */
export interface FrameRate {
	readonly arg: string;
	readonly value: number;
}

const STANDARD_RATES: readonly FrameRate[] = [
	{ arg: '24000/1001', value: 23.976 },
	{ arg: '24', value: 24 },
	{ arg: '25', value: 25 },
	{ arg: '30000/1001', value: 29.97 },
	{ arg: '30', value: 30 },
	{ arg: '48', value: 48 },
	{ arg: '50', value: 50 },
	{ arg: '60000/1001', value: 59.94 },
	{ arg: '60', value: 60 },
	{ arg: '90', value: 90 },
	{ arg: '100', value: 100 },
	{ arg: '120000/1001', value: 119.88 },
	{ arg: '120', value: 120 },
	{ arg: '240', value: 240 }
];
export const MAX_FPS = 240;
/** Used when the source does not report a usable rate. */
export const DEFAULT_FPS: FrameRate = { arg: '30', value: 30 };

/**
 * The constant output rate for a probed (possibly variable) rate: the nearest standard rate within
 * 2 %, otherwise the rate rounded to a whole number, capped at 240. Phone clips are often VFR with an
 * average like 29.83; that becomes 30.
 */
export const outputFrameRate = (fps: number | undefined): FrameRate => {
	if (!fps || !Number.isFinite(fps) || fps < 1) return DEFAULT_FPS;
	let best: FrameRate | undefined;
	for (const r of STANDARD_RATES) {
		const off = Math.abs(fps - eval1(r)) / eval1(r);
		if (off <= 0.02 && (!best || off < Math.abs(fps - eval1(best)) / eval1(best))) best = r;
	}
	if (best) return best;
	const whole = Math.min(MAX_FPS, Math.max(1, Math.round(fps)));
	return { arg: String(whole), value: whole };
};
const eval1 = (r: FrameRate) => ratio(r.arg)!;

/**
 * Frames between keyframes for a keyframe every 0.5 s: half the rate, rounded (29.97 -> 15, so
 * 0.5005 s). An exact half (25 -> 12.5) rounds down, so the interval never exceeds 0.5 s by much.
 */
export const keyframeInterval = (rate: FrameRate): number => {
	const half = eval1(rate) / 2;
	return Math.max(1, half % 1 === 0.5 ? Math.floor(half) : Math.round(half));
};

// ---------------------------------------------------------------------------------------------
// Commands

export interface FfmpegLimits {
	/** `-threads` cap per ffmpeg process. */
	readonly threads: number;
	readonly timeoutMs: number;
}

const base = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'];

/**
 * H.264 (yuv420p) / AAC MP4 with the moov atom first (`+faststart`), at most 1080p, constant frame
 * rate, a keyframe exactly every `keyframeInterval` frames (no scene-cut keyframes), so a seek lands
 * on a keyframe at most 0.5 s back. A source with no audio gives an output with no audio. ffmpeg
 * applies the source rotation, so the output is upright with no rotation flag.
 */
export const transcode = (
	input: string,
	output: string,
	src: ProbeResult,
	limits: FfmpegLimits
): Effect.Effect<{ fps: FrameRate; width: number; height: number }, FfmpegError> => {
	const fps = outputFrameRate(src.fps);
	const g = String(keyframeInterval(fps));
	const size = targetSize(src.width, src.height);
	const threads = String(limits.threads);
	const args = [
		...base,
		'-threads', threads,
		'-i', input,
		'-map', '0:v:0',
		'-map', '0:a:0?',
		'-vf', `scale=${size.width}:${size.height},setsar=1`,
		'-fps_mode', 'cfr',
		'-r', fps.arg,
		'-c:v', 'libx264',
		'-preset', 'fast',
		'-crf', '20',
		'-profile:v', 'high',
		'-pix_fmt', 'yuv420p',
		'-g', g,
		'-keyint_min', g,
		'-sc_threshold', '0',
		'-c:a', 'aac',
		'-b:a', '128k',
		'-ac', '2',
		'-movflags', '+faststart',
		'-map_metadata', '-1',
		'-threads', threads,
		output
	];
	return run('ffmpeg', args, { timeoutMs: limits.timeoutMs }).pipe(Effect.as({ fps, ...size }));
};

/** A JPEG frame from near the start; the `thumbnail` filter picks a representative (non-black) frame. */
export const poster = (input: string, output: string, durationMs: number, limits: FfmpegLimits) => {
	const at = Math.min(1, (durationMs / 1000) * 0.2).toFixed(3);
	return run(
		'ffmpeg',
		[...base, '-threads', String(limits.threads), '-ss', at, '-i', input, '-vf', 'thumbnail=30', '-frames:v', '1', '-q:v', '3', output],
		{ timeoutMs: limits.timeoutMs }
	).pipe(Effect.asVoid);
};

/** Scrub-preview sprite: one thumbnail per `intervalMs`, `columns` per row, at most `maxTiles`. */
export interface SpriteLayout {
	readonly intervalMs: number;
	readonly count: number;
	readonly columns: number;
	readonly rows: number;
	readonly tileWidth: number;
	readonly tileHeight: number;
}

export const SPRITE_TILE_WIDTH = 160;
export const SPRITE_COLUMNS = 10;
export const SPRITE_MAX_TILES = 300;
export const SPRITE_MIN_INTERVAL_MS = 500;

/** One tile per 0.5 s, widening the interval (in 100 ms steps) so a long clip stays under the tile cap. */
export const spriteLayout = (durationMs: number, width: number, height: number): SpriteLayout => {
	const d = Math.max(1, durationMs);
	const intervalMs = Math.max(SPRITE_MIN_INTERVAL_MS, Math.ceil(d / SPRITE_MAX_TILES / 100) * 100);
	const count = Math.max(1, Math.ceil(d / intervalMs));
	const columns = Math.min(SPRITE_COLUMNS, count);
	const tileWidth = Math.min(SPRITE_TILE_WIDTH, even(width));
	return {
		intervalMs,
		count,
		columns,
		rows: Math.ceil(count / columns),
		tileWidth,
		tileHeight: even((tileWidth * height) / width)
	};
};

export const sprite = (input: string, output: string, layout: SpriteLayout, limits: FfmpegLimits) => {
	const vf = `fps=1000/${layout.intervalMs},scale=${layout.tileWidth}:${layout.tileHeight},setsar=1,tile=${layout.columns}x${layout.rows}`;
	return run('ffmpeg', [...base, '-threads', String(limits.threads), '-i', input, '-vf', vf, '-frames:v', '1', '-q:v', '5', output], {
		timeoutMs: limits.timeoutMs
	}).pipe(Effect.asVoid);
};

const timestamp = (ms: number) => {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	const pad = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
};

/**
 * WebVTT thumbnails track: cue i covers [i * interval, (i + 1) * interval) (the last ends at the
 * duration) and points at its tile with a media fragment, e.g. `sprite.jpg#xywh=160,0,160,90`.
 * The image URL is relative to the VTT, so the player has to rewrite it to a signed URL.
 */
export const spriteVtt = (layout: SpriteLayout, durationMs: number, image = 'sprite.jpg'): string => {
	const lines = ['WEBVTT', ''];
	for (let i = 0; i < layout.count; i++) {
		const start = i * layout.intervalMs;
		const end = Math.min((i + 1) * layout.intervalMs, Math.max(durationMs, start + 1));
		const x = (i % layout.columns) * layout.tileWidth;
		const y = Math.floor(i / layout.columns) * layout.tileHeight;
		lines.push(`${timestamp(start)} --> ${timestamp(end)}`, `${image}#xywh=${x},${y},${layout.tileWidth},${layout.tileHeight}`, '');
	}
	return lines.join('\n');
};

export const writeSpriteVtt = (path: string, layout: SpriteLayout, durationMs: number) =>
	Effect.tryPromise({
		try: () => writeFile(path, spriteVtt(layout, durationMs)),
		catch: (e) => new FfmpegError({ message: `Could not write the sprite VTT: ${String(e)}`, timedOut: false, stderr: '' })
	});

// ---------------------------------------------------------------------------------------------
// Analysis segments (coach recordings from the browser)

/**
 * The real length of a file whose container does not say (a MediaRecorder WebM has no duration): decode it to
 * nowhere and read the last progress time. Milliseconds, or undefined when nothing was decoded.
 */
export const measureDurationMs = (input: string, limits: FfmpegLimits) =>
	run('ffmpeg', [...base, '-threads', String(limits.threads), '-i', input, '-map', '0:a:0?', '-map', '0:v:0?', '-f', 'null', '-progress', 'pipe:1', '-nostats', '-'], {
		timeoutMs: limits.timeoutMs
	}).pipe(
		Effect.map((out) => {
			const times = [...out.matchAll(/out_time_us=(\d+)/g)].map((m) => Number(m[1]));
			const last = times.at(-1);
			return last === undefined || !Number.isFinite(last) || last <= 0 ? undefined : Math.round(last / 1000);
		})
	);

/** The camera picture of a segment is at most this wide; the voice is the point, not the picture. */
export const SEGMENT_MAX_WIDTH = 1280;

/**
 * Normalize a browser recording to MP4/AAC (spec 3.D.3): audio-only becomes AAC in MP4; with a camera, H.264 too
 * (at most 1280 wide, 30 fps, a keyframe every 2 s). The result is exactly `lengthMs` long: a short recording is
 * padded (silence, and the last picture held) and a long one is cut, so the segment fits the timeline slot it was
 * recorded for. Timestamps are rebuilt, because a MediaRecorder file starts at an arbitrary time.
 */
export const normalizeSegment = (input: string, output: string, opts: { hasVideo: boolean; hasAudio: boolean; lengthMs: number }, limits: FfmpegLimits) => {
	const threads = String(limits.threads);
	const seconds = (opts.lengthMs / 1000).toFixed(3);
	const args = [
		...base,
		'-threads', threads,
		'-fflags', '+genpts',
		'-i', input,
		...(opts.hasVideo
			? [
					'-map', '0:v:0',
					'-vf', `scale='min(${SEGMENT_MAX_WIDTH},iw)':-2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=5`,
					'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0'
				]
			: ['-vn']),
		...(opts.hasAudio
			? ['-map', '0:a:0', '-af', 'aresample=async=1000:first_pts=0,apad', '-c:a', 'aac', '-b:a', opts.hasVideo ? '128k' : '96k', '-ar', '48000', '-ac', '1']
			: []),
		'-t', seconds,
		'-movflags', '+faststart',
		'-map_metadata', '-1',
		output
	];
	return run('ffmpeg', args, { timeoutMs: limits.timeoutMs }).pipe(Effect.asVoid);
};
