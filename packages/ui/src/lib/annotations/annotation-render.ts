import { angleDegrees, type AnnotationPoint, type AnnotationShape } from '@ttg/shared';
import type * as Fabric from 'fabric';

type FabricModule = Pick<typeof Fabric, 'Path' | 'Circle' | 'FabricText'>;

/** Dark halo behind every stroke so it reads on turf, sky and white shirts; white behind navy. */
const haloFor = (color: string) => (color === '#0E2B5C' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.6)');
const HALO_PX = 2;

const px = (p: AnnotationPoint, w: number, h: number) => ({ x: p.x * w, y: p.y * h });
const f = (n: number) => Math.round(n * 100) / 100;
const move = (p: { x: number; y: number }) => `M ${f(p.x)} ${f(p.y)}`;
const line = (p: { x: number; y: number }) => `L ${f(p.x)} ${f(p.y)}`;

/** SVG path for the arrow head: two barbs behind the tip. */
const arrowHead = (from: { x: number; y: number }, tip: { x: number; y: number }, stroke: number) => {
	const len = Math.max(12, stroke * 4);
	const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
	const barb = (side: number) => ({ x: tip.x - len * Math.cos(ang + side * 0.45), y: tip.y - len * Math.sin(ang + side * 0.45) });
	return `${move(barb(1))} ${line(tip)} ${line(barb(-1))}`;
};

/** Arc of radius `r` at `vertex` from the arm toward `a` to the arm toward `b`, the short way round. */
const angleArc = (vertex: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, r: number) => {
	const a1 = Math.atan2(a.y - vertex.y, a.x - vertex.x);
	const a2 = Math.atan2(b.y - vertex.y, b.x - vertex.x);
	let delta = a2 - a1;
	while (delta > Math.PI) delta -= 2 * Math.PI;
	while (delta < -Math.PI) delta += 2 * Math.PI;
	const start = { x: vertex.x + r * Math.cos(a1), y: vertex.y + r * Math.sin(a1) };
	const end = { x: vertex.x + r * Math.cos(a1 + delta), y: vertex.y + r * Math.sin(a1 + delta) };
	const mid = a1 + delta / 2;
	return { d: `${move(start)} A ${f(r)} ${f(r)} 0 0 ${delta > 0 ? 1 : 0} ${f(end.x)} ${f(end.y)}`, mid };
};

const stroked = (F: FabricModule, d: string, color: string, width: number) => {
	const common = { fill: '', strokeLineCap: 'round', strokeLineJoin: 'round', selectable: false, evented: false, objectCaching: false } as const;
	return [
		new F.Path(d, { ...common, stroke: haloFor(color), strokeWidth: width + HALO_PX * 2 }),
		new F.Path(d, { ...common, stroke: color, strokeWidth: width })
	];
};

const label = (F: FabricModule, text: string, at: { x: number; y: number }, color: string, size: number) =>
	new F.FabricText(text, {
		left: at.x,
		top: at.y,
		originX: 'center',
		originY: 'center',
		fontFamily: 'Inter, system-ui, sans-serif',
		fontWeight: '700',
		fontSize: size,
		fill: color,
		stroke: haloFor(color),
		strokeWidth: HALO_PX * 2,
		paintFirst: 'stroke',
		strokeLineJoin: 'round',
		selectable: false,
		evented: false,
		objectCaching: false
	});

/**
 * Fabric objects for one shape on a canvas of `w` x `h` CSS pixels. Everything scales from the normalized shape, so
 * the same stored JSON is right at any display size.
 */
export const shapeToFabric = (F: FabricModule, shape: AnnotationShape, w: number, h: number) => {
	const width = Math.max(1.5, shape.width * w);
	switch (shape.type) {
		case 'line': {
			const a = px(shape.a, w, h);
			const b = px(shape.b, w, h);
			return stroked(F, `${move(a)} ${line(b)}`, shape.color, width);
		}
		case 'arrow': {
			const a = px(shape.a, w, h);
			const b = px(shape.b, w, h);
			return stroked(F, `${move(a)} ${line(b)} ${arrowHead(a, b, width)}`, shape.color, width);
		}
		case 'circle': {
			const c = px(shape.c, w, h);
			const r = shape.r * w;
			const common = { left: c.x, top: c.y, originX: 'center', originY: 'center', radius: r, fill: '', selectable: false, evented: false, objectCaching: false } as const;
			return [
				new F.Circle({ ...common, stroke: haloFor(shape.color), strokeWidth: width + HALO_PX * 2 }),
				new F.Circle({ ...common, stroke: shape.color, strokeWidth: width })
			];
		}
		case 'angle': {
			const a = px(shape.a, w, h);
			const v = px(shape.vertex, w, h);
			const b = px(shape.b, w, h);
			const arms = Math.min(Math.hypot(a.x - v.x, a.y - v.y), Math.hypot(b.x - v.x, b.y - v.y));
			const r = Math.min(arms * 0.4, w * 0.08);
			const arc = angleArc(v, a, b, r);
			const deg = Math.round(angleDegrees(shape, w, h));
			const labelAt = { x: v.x + (r + 18) * Math.cos(arc.mid), y: v.y + (r + 18) * Math.sin(arc.mid) };
			return [
				...stroked(F, `${move(a)} ${line(v)} ${line(b)}`, shape.color, width),
				...stroked(F, arc.d, shape.color, Math.max(1.5, width * 0.7)),
				label(F, `${deg}°`, labelAt, shape.color, Math.max(14, h * 0.04))
			];
		}
		case 'freehand': {
			const pts = shape.points.map((p) => px(p, w, h));
			const d = pts.map((p, i) => (i === 0 ? move(p) : line(p))).join(' ');
			return stroked(F, d, shape.color, width);
		}
		case 'text': {
			const t = label(F, shape.text, px(shape.at, w, h), shape.color, Math.max(12, shape.size * h));
			t.set({ originX: 'left', originY: 'top' });
			return [t];
		}
	}
};
