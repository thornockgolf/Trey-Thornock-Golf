import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
	AnnotationShape,
	CreateAnnotationRequest,
	MAX_FREEHAND_POINTS,
	UpdateAnnotationRequest,
	angleDegrees,
	describeShape,
	isVisibleAt,
	shapeBytes
} from './annotations';

const decode = Schema.decodeUnknownSync(AnnotationShape);
const arrow = { v: 1, type: 'arrow', color: '#D4A017', width: 0.005, a: { x: 0.1, y: 0.2 }, b: { x: 0.8, y: 0.9 } };

describe('AnnotationShape', () => {
	it('accepts each tool', () => {
		const p = { x: 0.5, y: 0.5 };
		const common = { v: 1, color: '#FFFFFF', width: 0.004 };
		for (const s of [
			{ ...common, type: 'line', a: p, b: p },
			{ ...common, type: 'circle', c: p, r: 0.1 },
			{ ...common, type: 'angle', a: p, vertex: p, b: p },
			{ ...common, type: 'freehand', points: [p, p] },
			{ ...common, type: 'text', at: p, text: 'Hips', size: 0.05 },
			arrow
		]) {
			expect(decode(s)).toEqual(s);
		}
	});

	it('strips properties outside the allowlist', () => {
		const out = decode({ ...arrow, onclick: 'alert(1)', a: { x: 0.1, y: 0.2, z: 3 } }) as any;
		expect(out.onclick).toBeUndefined();
		expect(out.a.z).toBeUndefined();
	});

	it.each([
		['unknown type', { ...arrow, type: 'image' }],
		['coordinate over 1', { ...arrow, a: { x: 1.2, y: 0 } }],
		['negative coordinate', { ...arrow, b: { x: -0.1, y: 0 } }],
		['NaN', { ...arrow, a: { x: NaN, y: 0 } }],
		['colour outside the palette', { ...arrow, color: 'red' }],
		['wrong version', { ...arrow, v: 2 }],
		['huge stroke', { ...arrow, width: 0.5 }],
		['empty text', { v: 1, type: 'text', color: '#FFFFFF', width: 0.004, at: { x: 0, y: 0 }, text: '', size: 0.05 }],
		['too many points', { v: 1, type: 'freehand', color: '#FFFFFF', width: 0.004, points: Array.from({ length: MAX_FREEHAND_POINTS + 1 }, () => ({ x: 0, y: 0 })) }]
	])('rejects %s', (_n, bad) => {
		expect(() => decode(bad)).toThrow();
	});
});

describe('requests', () => {
	it('needs integer milliseconds', () => {
		const ok = { startMs: 2400, endMs: 4000, shape: arrow };
		expect(Schema.decodeUnknownSync(CreateAnnotationRequest)(ok)).toEqual(ok);
		expect(() => Schema.decodeUnknownSync(CreateAnnotationRequest)({ ...ok, startMs: 2.5 })).toThrow();
		expect(() => Schema.decodeUnknownSync(CreateAnnotationRequest)({ ...ok, startMs: -1 })).toThrow();
	});
	it('update requires a version', () => {
		expect(() => Schema.decodeUnknownSync(UpdateAnnotationRequest)({ endMs: 5 })).toThrow();
		expect(Schema.decodeUnknownSync(UpdateAnnotationRequest)({ version: 2, endMs: 5 })).toEqual({ version: 2, endMs: 5 });
	});
});

describe('helpers', () => {
	it('visibility is inclusive', () => {
		const a = { startMs: 2400, endMs: 4000 };
		expect([2399, 2400, 3000, 4000, 4001].map((ms) => isVisibleAt(a, ms))).toEqual([false, true, true, true, false]);
	});
	it('measures angles in pixels, not normalized units', () => {
		const v = { x: 0.5, y: 0.5 };
		expect(angleDegrees({ a: { x: 1, y: 0.5 }, vertex: v, b: { x: 0.5, y: 1 } }, 100, 100)).toBeCloseTo(90);
		// arms to the top-right and bottom-right corners of a 16:9 frame: 2 * atan(45 / 80)
		expect(angleDegrees({ a: { x: 1, y: 1 }, vertex: v, b: { x: 1, y: 0 } }, 160, 90)).toBeCloseTo(2 * Math.atan2(45, 80) * (180 / Math.PI));
		expect(angleDegrees({ a: v, vertex: v, b: v }, 100, 100)).toBe(0);
	});
	it('describes shapes', () => {
		expect(describeShape(arrow as any)).toBe('Arrow');
		expect(describeShape({ v: 1, type: 'text', color: '#FFFFFF', width: 0.004, at: { x: 0, y: 0 }, text: 'Hips', size: 0.05 })).toBe('Text: Hips');
	});
	it('measures stored size', () => {
		expect(shapeBytes(arrow)).toBeGreaterThan(50);
	});
});
