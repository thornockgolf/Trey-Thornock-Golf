import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Test-only helpers: generate small clips with ffmpeg and inspect outputs with ffprobe. */

const sh = (cmd: string, args: string[]) => {
	const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
	return r.stdout;
};
const ffmpeg = (...args: string[]) => sh('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
export const ffprobeJson = (path: string, ...args: string[]) => JSON.parse(sh('ffprobe', ['-v', 'error', '-print_format', 'json', ...args, path]));

const x264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'];
const sine = (seconds: number) => ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`];

export interface Fixtures {
	/** 4 s, 1280x720, 30 fps, with audio (MP4). */
	readonly basic: string;
	/** 3 s, 640x360, irregular frame timing averaging about 29.8 fps, with audio (MOV). */
	readonly vfr: string;
	/** 2 s, 3840x2160, 30 fps, with audio. */
	readonly uhd: string;
	/** 3 s, 1280x720, no audio track (WebM, VP9). */
	readonly silent: string;
	/** The basic clip with a 90 degree display rotation (as a phone records portrait). */
	readonly rotated: string;
	/** 5 min 10 s of a tiny black frame at 1 fps (too long). */
	readonly long: string;
	/** Random bytes named .mp4. */
	readonly garbage: string;
}

export const makeFixtures = (dir: string): Fixtures => {
	const f = (name: string) => join(dir, name);
	const basic = f('basic.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'testsrc=duration=4:size=1280x720:rate=30', ...sine(4), ...x264, '-c:a', 'aac', '-shortest', basic);
	const vfr = f('vfr.mov');
	ffmpeg(
		'-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=30', ...sine(3),
		'-vf', "settb=1/90000,setpts='(N*0.0336+if(mod(N\\,3)\\,0.008\\,0))/TB'", '-fps_mode', 'passthrough', '-enc_time_base', '1:90000',
		...x264, '-c:a', 'aac', '-shortest', vfr
	);
	const uhd = f('uhd.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'testsrc=duration=2:size=3840x2160:rate=30', ...sine(2), ...x264, '-c:a', 'aac', '-shortest', uhd);
	const silent = f('silent.webm');
	ffmpeg('-f', 'lavfi', '-i', 'testsrc=duration=3:size=1280x720:rate=30', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', silent);
	const rotated = f('rotated.mp4');
	ffmpeg('-display_rotation', '90', '-i', basic, '-c', 'copy', rotated);
	const long = f('long.mp4');
	ffmpeg('-f', 'lavfi', '-i', 'color=c=black:size=64x64:rate=1', '-t', '310', ...x264, long);
	const garbage = f('garbage.mp4');
	writeFileSync(garbage, randomBytes(256 * 1024));
	return { basic, vfr, uhd, silent, rotated, long, garbage };
};

/** Presentation times (seconds) of the keyframes in the first video stream. */
export const keyframeTimes = (path: string): number[] => {
	const j = ffprobeJson(path, '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags');
	return (j.packets as { pts_time: string; flags: string }[])
		.filter((p) => p.flags.startsWith('K'))
		.map((p) => Number(p.pts_time))
		.sort((a, b) => a - b);
};

/** Distinct video packet durations (one value for a constant frame rate). */
export const frameDurations = (path: string): number[] => {
	const j = ffprobeJson(path, '-select_streams', 'v:0', '-show_entries', 'packet=duration');
	return [...new Set((j.packets as { duration: string }[]).map((p) => Number(p.duration)))];
};

/** Top-level MP4 box types in order (e.g. ftyp, moov, mdat for a faststart file). */
export const topLevelBoxes = (path: string): string[] => {
	const b = readFileSync(path);
	const out: string[] = [];
	let i = 0;
	while (i + 8 <= b.length) {
		let size = b.readUInt32BE(i);
		const type = b.toString('latin1', i + 4, i + 8);
		if (size === 1) size = Number(b.readBigUInt64BE(i + 8));
		else if (size === 0) size = b.length - i;
		out.push(type);
		if (size < 8) break;
		i += size;
	}
	return out;
};
