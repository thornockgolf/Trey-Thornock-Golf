/**
 * Dev-only media for the player preview: a generated 60 fps test clip (8 s, keyframe every 0.5 s,
 * burned-in time counter), its poster, scrub sprite and sprite VTT, built once with ffmpeg into a
 * temp folder and served with Range support (so seeking works like it does from R2).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CLIP_SECONDS = 8;
export const CLIP_FPS = 60;
const dir = join(tmpdir(), 'ttg-dev-player');

const ffmpeg = (args: string[]) => {
	const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
};

export const ensureMedia = () => {
	mkdirSync(dir, { recursive: true });
	const clip = join(dir, 'clip.mp4');
	if (!existsSync(clip)) {
		ffmpeg([
			'-f', 'lavfi', '-i', `testsrc=duration=${CLIP_SECONDS}:size=1280x720:rate=${CLIP_FPS}`,
			'-f', 'lavfi', '-i', `sine=frequency=440:duration=${CLIP_SECONDS}`,
			'-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', String(CLIP_FPS / 2), '-keyint_min', String(CLIP_FPS / 2), '-sc_threshold', '0',
			'-c:a', 'aac', '-movflags', '+faststart', '-shortest', clip
		]);
		ffmpeg(['-i', clip, '-frames:v', '1', join(dir, 'poster.jpg')]);
		ffmpeg(['-i', clip, '-vf', `fps=2,scale=160:90,tile=${CLIP_SECONDS * 2}x1`, '-frames:v', '1', join(dir, 'sprite.jpg')]);
		const ts = (ms: number) => new Date(ms).toISOString().slice(11, 23);
		const cues = Array.from({ length: CLIP_SECONDS * 2 }, (_, i) => `${ts(i * 500)} --> ${ts((i + 1) * 500)}\nsprite.jpg#xywh=${i * 160},0,160,90\n`);
		writeFileSync(join(dir, 'sprite.vtt'), `WEBVTT\n\n${cues.join('\n')}`);
	}
	return dir;
};

const TYPES: Record<string, string> = { 'clip.mp4': 'video/mp4', 'poster.jpg': 'image/jpeg', 'sprite.jpg': 'image/jpeg', 'sprite.vtt': 'text/vtt' };

/** A file response with `Range` support. Unknown names are undefined. */
export const serveMedia = (name: string, rangeHeader: string | null, download?: string) => {
	const type = TYPES[name];
	if (!type) return undefined;
	const path = join(ensureMedia(), name);
	const size = statSync(path).size;
	const data = readFileSync(path);
	const headers: Record<string, string> = {
		'content-type': type,
		'accept-ranges': 'bytes',
		'cache-control': 'no-store',
		'access-control-allow-origin': '*'
	};
	if (download) headers['content-disposition'] = `attachment; filename="${download}"`;
	const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader ?? '');
	if (!m) return new Response(data, { headers: { ...headers, 'content-length': String(size) } });
	const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
	const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
	if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
	return new Response(data.subarray(start, end + 1), {
		status: 206,
		headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) }
	});
};
