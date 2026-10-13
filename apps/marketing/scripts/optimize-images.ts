/**
 * Responsive image variants for the marketing site. Run with `bun run images` after adding or changing a source
 * image in `static/images/`. For each source (JPEG or PNG) it writes `<name>-<width>.webp` and `.avif` next to it
 * and a manifest (`src/lib/content/image-manifest.json`) that `ResponsiveImage.svelte` reads to build `srcset`.
 * Variants are committed (about 1 MB in all), so the Netlify build needs no image tooling. Idempotent: an
 * up-to-date variant is skipped, and one whose source is gone is deleted.
 */
import { existsSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'static/images');
const manifestPath = join(root, 'src/lib/content/image-manifest.json');

/** Display widths per source, in CSS px at 1x; a variant is made at 1x and 2x (never above the source). Default below. */
const DISPLAY: Record<string, number[]> = {
	'img-01': [40], // header logo
	'img-13': [150], // footer logo
	'img-12': [450], // about portrait
	'img-08': [700, 1400], // junior banner
	'img-03': [520], // hero portrait
	'img-02': [700] // hero backdrop (full bleed, crops on any width)
};
const DEFAULT_DISPLAY = [400];
const QUALITY = { webp: 74, avif: 50 };

const sources = readdirSync(dir).filter((f) => /^img-\d+\.(jpg|png)$/.test(f));
const manifest: Record<string, { src: string; width: number; height: number; widths: number[] }> = {};
const wanted = new Set<string>();

for (const file of sources) {
	const name = file.replace(/\.\w+$/, '');
	const srcPath = join(dir, file);
	const meta = await sharp(srcPath).metadata();
	const { width, height } = meta as { width: number; height: number };
	const widths = [...new Set((DISPLAY[name] ?? DEFAULT_DISPLAY).flatMap((w) => [w, w * 2]).map((w) => Math.min(w, width)))].sort((a, b) => a - b);
	manifest[name] = { src: `/images/${file}`, width, height, widths };
	for (const w of widths) {
		for (const fmt of ['webp', 'avif'] as const) {
			const out = `${name}-${w}.${fmt}`;
			wanted.add(out);
			const outPath = join(dir, out);
			if (existsSync(outPath) && statSync(outPath).mtimeMs >= statSync(srcPath).mtimeMs) continue;
			const img = sharp(srcPath).resize({ width: w, withoutEnlargement: true });
			await (fmt === 'webp' ? img.webp({ quality: QUALITY.webp }) : img.avif({ quality: QUALITY.avif, effort: 4 })).toFile(outPath);
			console.log('wrote', out, `${Math.round(statSync(outPath).size / 1024)} KB`);
		}
	}
}

// Drop variants whose source or size is gone, and the old one-off `<name>.webp` files.
for (const f of readdirSync(dir)) {
	if (/^img-\d+(-\d+)?\.(webp|avif)$/.test(f) && !wanted.has(f)) {
		unlinkSync(join(dir, f));
		console.log('removed', f);
	}
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
console.log(`manifest: ${Object.keys(manifest).length} images`);
