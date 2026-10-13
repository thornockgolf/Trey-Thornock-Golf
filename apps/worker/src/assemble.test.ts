import type { AnnotationShape } from '@ttg/shared';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { framesSvg } from './annotation-svg';
import { assembleArgs } from './assemble';

const GOLD = [0xd4, 0xa0, 0x17];
const pixels = async (shapes: AnnotationShape[], w: number, h: number) => {
	const { data, info } = await sharp(Buffer.from(framesSvg(shapes, w, h))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	return (x: number, y: number) => [...data.subarray((Math.round(y) * info.width + Math.round(x)) * 4, (Math.round(y) * info.width + Math.round(x)) * 4 + 4)];
};

describe('annotation SVG', () => {
	it('draws a line in its colour where the normalized points say, and leaves the rest transparent', async () => {
		const at = await pixels([{ v: 1, type: 'line', color: '#D4A017', width: 0.01, a: { x: 0.1, y: 0.5 }, b: { x: 0.9, y: 0.5 } }], 400, 200);
		expect(at(200, 100)).toEqual([...GOLD, 255]);
		expect(at(200, 20)[3]).toBe(0);
		expect(at(20, 100)[3]).toBe(0); // before the line starts at x = 40
		// the dark halo is just outside the stroke (stroke 4 px wide: 98..102, halo 2 px more)
		const halo = at(200, 96);
		expect(halo[3]).toBeGreaterThan(100);
		expect(halo.slice(0, 3).every((c) => c < 40)).toBe(true);
	});

	it('draws a circle as a ring, not a disc, at its radius (a fraction of the width)', async () => {
		const at = await pixels([{ v: 1, type: 'circle', color: '#FFFFFF', width: 0.01, c: { x: 0.5, y: 0.5 }, r: 0.2 }], 400, 400);
		expect(at(200 + 80, 200)).toEqual([255, 255, 255, 255]);
		expect(at(200, 200)[3]).toBe(0);
	});

	it('draws an arrow with a head at its tip, and a text note', async () => {
		const at = await pixels([{ v: 1, type: 'arrow', color: '#D4A017', width: 0.01, a: { x: 0.1, y: 0.5 }, b: { x: 0.9, y: 0.5 } }], 400, 200);
		expect(at(300, 100)).toEqual([...GOLD, 255]); // shaft
		// a barb of the head, behind the tip at x = 360: 16 px long at 0.45 rad
		expect(at(360 - 16 * Math.cos(0.45) * 0.5, 100 - 16 * Math.sin(0.45) * 0.5)[3]).toBeGreaterThan(200);
		const svg = framesSvg([{ v: 1, type: 'text', color: '#FFFFFF', width: 0.005, at: { x: 0.1, y: 0.1 }, text: 'Hips <open> & "early"', size: 0.1 }], 400, 200);
		expect(svg).toContain('Hips &lt;open&gt; &amp; &quot;early&quot;');
		const text = await pixels([{ v: 1, type: 'text', color: '#FFFFFF', width: 0.005, at: { x: 0.1, y: 0.1 }, text: 'MMMM', size: 0.2 }], 400, 200);
		let white = 0;
		for (let y = 20; y < 80; y++) for (let x = 40; x < 160; x++) if (text(x, y)[3] === 255 && text(x, y)[0] === 255) white++;
		expect(white).toBeGreaterThan(100);
	});

	it('labels an angle with its degrees', () => {
		const svg = framesSvg([{ v: 1, type: 'angle', color: '#D4A017', width: 0.005, a: { x: 0.8, y: 0.5 }, vertex: { x: 0.5, y: 0.5 }, b: { x: 0.5, y: 0.1 } }], 1600, 900);
		expect(svg).toContain('>90°<');
	});
});

describe('assembleArgs', () => {
	const base = { video: 'v.mp4', videoHasAudio: true, durationMs: 10_000, fps: 30, output: 'o.mp4', threads: 2 };
	const graphOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]!;

	it('places each clip at its exact millisecond slot, cut from where it starts', () => {
		const args = assembleArgs({ ...base, clips: [{ path: 'a.mp4', startMs: 1_500, endMs: 3_500, clipStartMs: 0 }, { path: 'b.mp4', startMs: 7_250, endMs: 9_000, clipStartMs: 12_000 }] });
		const g = graphOf(args);
		expect(g).toContain('[1:a]aresample=48000,atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS');
		expect(g).toContain('adelay=1500|1500[c0]');
		expect(g).toContain('[2:a]aresample=48000,atrim=start=12.000:end=13.750,asetpts=PTS-STARTPTS');
		expect(g).toContain('adelay=7250|7250[c1]');
		expect(g).toContain('[a0][c0][c1]amix=inputs=3:duration=longest:normalize=0');
		expect(args).toEqual(expect.arrayContaining(['-map', '0:v:0', '-map', '[ao]', '-t', '10.000']));
	});

	it('overlays the annotation pictures only when there are some, and mixes only what has sound', () => {
		const plain = assembleArgs({ ...base, videoHasAudio: false, clips: [] });
		expect(plain).not.toContain('-filter_complex');
		expect(plain).not.toContain('-c:a');
		const withOverlay = assembleArgs({ ...base, overlayList: 'o.txt', clips: [] });
		expect(withOverlay).toEqual(expect.arrayContaining(['-f', 'concat', '-i', 'o.txt', '-map', '[vo]']));
		expect(graphOf(withOverlay)).toContain('[1:v]fps=30,format=rgba[ov];[0:v][ov]overlay=0:0:format=auto');
	});
});

