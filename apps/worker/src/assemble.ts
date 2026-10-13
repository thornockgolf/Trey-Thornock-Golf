import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect } from 'effect';
import sharp from 'sharp';
import { framesSvg } from './annotation-svg';
import type { OverlayInterval } from './export-timeline';
import { run, FfmpegError, type FfmpegLimits } from './ffmpeg';

/**
 * Flatten an analysis into one MP4 (`analysis.assemble`): the processed video, the annotations drawn on it, and the
 * coach's commentary segments mixed in at their exact slots of the timeline.
 *
 * How, and why (the decision, written down before it was built):
 *  - Commentary: every live segment is an `adelay`ed, trimmed copy of its clip (`clipStartMs` for the slot's length,
 *    delayed by `startMs`), mixed with the video's own sound by `amix` (no normalization, so levels are what the
 *    player hears). Millisecond-exact, no re-timing of the video.
 *  - Annotations are JSON, so they are drawn from the JSON: each stretch of the timeline with the same annotations
 *    visible is rendered once to a transparent PNG (SVG through sharp: the same geometry as the Fabric canvas), the
 *    PNGs are fed to ffmpeg as one concat-demuxer input and `overlay`ed on the video. ffmpeg's own drawbox/drawtext
 *    cannot draw lines, arrows, circles or freehand strokes, and an ASS drawing would be a second, different
 *    renderer to keep in step with Fabric.
 *  - Left out: the coach's camera picture (only the voice is mixed) and the reference-video overlay of `/compare`.
 */

export interface AssembleClip {
	readonly path: string;
	readonly startMs: number;
	readonly endMs: number;
	/** Where in the clip this slot starts playing. */
	readonly clipStartMs: number;
	/** A one-channel clip (a voice recording): it is copied to both sides at full level, as a browser plays it. */
	readonly mono?: boolean;
}

export interface AssembleOptions {
	readonly video: string;
	readonly videoHasAudio: boolean;
	readonly durationMs: number;
	readonly fps: number;
	/** The concat-demuxer list of overlay pictures, when any annotation is visible. */
	readonly overlayList?: string;
	/** Only clips that have an audio track. */
	readonly clips: readonly AssembleClip[];
	readonly output: string;
	readonly threads: number;
}

const sec = (ms: number) => (ms / 1000).toFixed(3);

/** The ffmpeg arguments. Pure, so the graph can be tested without running ffmpeg. */
export const assembleArgs = (o: AssembleOptions): string[] => {
	const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-threads', String(o.threads), '-i', o.video];
	let next = 1;
	let overlayIndex: number | undefined;
	if (o.overlayList) {
		args.push('-f', 'concat', '-safe', '0', '-i', o.overlayList);
		overlayIndex = next++;
	}
	const clipIndex: number[] = [];
	for (const c of o.clips) {
		args.push('-i', c.path);
		clipIndex.push(next++);
	}

	const graph: string[] = [];
	if (overlayIndex !== undefined) {
		graph.push(`[${overlayIndex}:v]fps=${o.fps},format=rgba[ov]`);
		graph.push(`[0:v][ov]overlay=0:0:format=auto:eof_action=repeat[vo]`);
	}
	const audio: string[] = [];
	if (o.videoHasAudio) {
		graph.push('[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]');
		audio.push('[a0]');
	}
	o.clips.forEach((c, i) => {
		const start = sec(c.clipStartMs);
		const end = sec(c.clipStartMs + (c.endMs - c.startMs));
		graph.push(
			`[${clipIndex[i]}:a]aresample=48000,atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS,` +
				`${c.mono ? 'pan=stereo|c0=c0|c1=c0' : 'aformat=sample_fmts=fltp:channel_layouts=stereo'},adelay=${c.startMs}|${c.startMs}[c${i}]`
		);
		audio.push(`[c${i}]`);
	});
	if (audio.length > 0) graph.push(`${audio.join('')}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.95[ao]`);

	if (graph.length > 0) args.push('-filter_complex', graph.join(';'));
	args.push('-map', overlayIndex !== undefined ? '[vo]' : '0:v:0');
	if (audio.length > 0) args.push('-map', '[ao]');
	args.push(
		'-t', sec(o.durationMs),
		'-c:v', 'libx264', '-preset', 'fast', '-crf', '21', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
		...(audio.length > 0 ? ['-c:a', 'aac', '-b:a', '160k', '-ar', '48000'] : []),
		'-movflags', '+faststart',
		'-map_metadata', '-1',
		'-threads', String(o.threads),
		o.output
	);
	return args;
};

/**
 * Write one transparent PNG per interval (a shared blank one for stretches with nothing visible) and the concat list
 * that plays them for their lengths. Returns undefined when no annotation is ever visible: no overlay input then.
 */
export const renderOverlayFrames = async (intervals: readonly OverlayInterval[], w: number, h: number, dir: string): Promise<string | undefined> => {
	if (intervals.every((i) => i.shapes.length === 0)) return undefined;
	const frames = join(dir, 'overlay');
	await mkdir(frames, { recursive: true });
	const blank = join(frames, 'blank.png');
	await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(blank);
	const lines: string[] = [];
	let last = blank;
	for (const [i, iv] of intervals.entries()) {
		let file = blank;
		if (iv.shapes.length > 0) {
			file = join(frames, `f${String(i).padStart(4, '0')}.png`);
			await sharp(Buffer.from(framesSvg(iv.shapes, w, h))).png().toFile(file);
		}
		lines.push(`file '${file}'`, `duration ${sec(iv.endMs - iv.startMs)}`);
		last = file;
	}
	// The concat demuxer ignores the last duration unless the file is listed once more.
	lines.push(`file '${last}'`);
	const list = join(dir, 'overlay.txt');
	await writeFile(list, lines.join('\n') + '\n');
	return list;
};

export const assemble = (opts: AssembleOptions, limits: FfmpegLimits): Effect.Effect<void, FfmpegError> =>
	run('ffmpeg', assembleArgs({ ...opts, threads: limits.threads }), { timeoutMs: limits.timeoutMs }).pipe(Effect.asVoid);
