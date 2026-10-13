import { angleDegrees, type AnnotationPoint, type AnnotationShape } from '@ttg/shared';

/**
 * The annotation shapes as SVG, for the flattened export (`analysis.assemble`). This is the same drawing as the
 * Fabric canvas the player sees (`packages/ui/src/lib/annotations/annotation-render.ts`): the same path geometry,
 * stroke widths, dark halo behind every stroke, arrow barbs and angle arc, computed from the normalized shape for a
 * frame of `w` x `h` pixels. Keep the two in step when a shape changes.
 */

/** Dark halo behind every stroke so it reads on turf, sky and white shirts; white behind navy. */
const haloFor = (color: string) => (color === '#0E2B5C' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)');
const HALO_PX = 2;
const FONT = "Inter, 'DejaVu Sans', Arial, Helvetica, sans-serif";

type Pt = { x: number; y: number };
const px = (p: AnnotationPoint, w: number, h: number): Pt => ({ x: p.x * w, y: p.y * h });
const f = (n: number) => Math.round(n * 100) / 100;
const move = (p: Pt) => `M ${f(p.x)} ${f(p.y)}`;
const line = (p: Pt) => `L ${f(p.x)} ${f(p.y)}`;

const arrowHead = (from: Pt, tip: Pt, stroke: number) => {
	const len = Math.max(12, stroke * 4);
	const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
	const barb = (side: number) => ({ x: tip.x - len * Math.cos(ang + side * 0.45), y: tip.y - len * Math.sin(ang + side * 0.45) });
	return `${move(barb(1))} ${line(tip)} ${line(barb(-1))}`;
};

const angleArc = (vertex: Pt, a: Pt, b: Pt, r: number) => {
	const a1 = Math.atan2(a.y - vertex.y, a.x - vertex.x);
	const a2 = Math.atan2(b.y - vertex.y, b.x - vertex.x);
	let delta = a2 - a1;
	while (delta > Math.PI) delta -= 2 * Math.PI;
	while (delta < -Math.PI) delta += 2 * Math.PI;
	const start = { x: vertex.x + r * Math.cos(a1), y: vertex.y + r * Math.sin(a1) };
	const end = { x: vertex.x + r * Math.cos(a1 + delta), y: vertex.y + r * Math.sin(a1 + delta) };
	return { d: `${move(start)} A ${f(r)} ${f(r)} 0 0 ${delta > 0 ? 1 : 0} ${f(end.x)} ${f(end.y)}`, mid: a1 + delta / 2 };
};

const stroked = (d: string, color: string, width: number) => {
	const common = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
	return `<path d="${d}" ${common} stroke="${haloFor(color)}" stroke-width="${f(width + HALO_PX * 2)}"/><path d="${d}" ${common} stroke="${color}" stroke-width="${f(width)}"/>`;
};

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const text = (t: string, at: Pt, color: string, size: number, anchor: 'start' | 'middle') =>
	`<text x="${f(at.x)}" y="${f(at.y)}" font-family="${FONT}" font-weight="700" font-size="${f(size)}" text-anchor="${anchor}" ` +
	`fill="${color}" stroke="${haloFor(color)}" stroke-width="${HALO_PX * 2}" stroke-linejoin="round" paint-order="stroke">${escapeXml(t)}</text>`;

/** SVG elements for one shape. */
export const shapeToSvg = (shape: AnnotationShape, w: number, h: number): string => {
	const width = Math.max(1.5, shape.width * w);
	switch (shape.type) {
		case 'line':
			return stroked(`${move(px(shape.a, w, h))} ${line(px(shape.b, w, h))}`, shape.color, width);
		case 'arrow': {
			const a = px(shape.a, w, h);
			const b = px(shape.b, w, h);
			return stroked(`${move(a)} ${line(b)} ${arrowHead(a, b, width)}`, shape.color, width);
		}
		case 'circle': {
			const c = px(shape.c, w, h);
			const r = shape.r * w;
			const ring = (stroke: string, sw: number) => `<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" fill="none" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
			return ring(haloFor(shape.color), width + HALO_PX * 2) + ring(shape.color, width);
		}
		case 'angle': {
			const a = px(shape.a, w, h);
			const v = px(shape.vertex, w, h);
			const b = px(shape.b, w, h);
			const arms = Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y));
			const r = Math.min(arms * 0.4, w * 0.08);
			const arc = angleArc(v, a, b, r);
			const size = Math.max(14, h * 0.04);
			const labelAt = { x: v.x + (r + 18) * Math.cos(arc.mid), y: v.y + (r + 18) * Math.sin(arc.mid) + size * 0.35 };
			return (
				stroked(`${move(a)} ${line(v)} ${line(b)}`, shape.color, width) +
				stroked(arc.d, shape.color, Math.max(1.5, width * 0.7)) +
				text(`${Math.round(angleDegrees(shape, w, h))}°`, labelAt, shape.color, size, 'middle')
			);
		}
		case 'freehand':
			return stroked(shape.points.map((p, i) => (i === 0 ? move(px(p, w, h)) : line(px(p, w, h)))).join(' '), shape.color, width);
		case 'text': {
			const size = Math.max(12, shape.size * h);
			// Fabric anchors text at its top-left; SVG at the baseline, about 0.8 of the font size below the top.
			return text(shape.text, { ...px(shape.at, w, h), y: px(shape.at, w, h).y + size * 0.8 }, shape.color, size, 'start');
		}
	}
};

/** A transparent full-frame SVG with the given shapes drawn in order. */
export const framesSvg = (shapes: readonly AnnotationShape[], w: number, h: number): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${shapes.map((s) => shapeToSvg(s, w, h)).join('')}</svg>`;
