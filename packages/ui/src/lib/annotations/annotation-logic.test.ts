import type { AnnotationPoint } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { DrawSession, History, containRect, endFor, showForOf, simplifyPath, toNormalized } from './annotation-logic';

const P = (x: number, y: number): AnnotationPoint => ({ x, y });
const GOLD = '#D4A017' as const;

describe('containRect', () => {
	it('fills a box of the same aspect', () => {
		expect(containRect({ w: 640, h: 360 }, 16 / 9)).toEqual({ x: 0, y: 0, w: 640, h: 360 });
	});
	it('pillarboxes a vertical video in a wide box', () => {
		const r = containRect({ w: 640, h: 360 }, 9 / 16);
		expect(r.h).toBe(360);
		expect(r.w).toBeCloseTo(202.5);
		expect(r.x).toBeCloseTo((640 - 202.5) / 2);
		expect(r.y).toBe(0);
	});
	it('letterboxes a wide video in a tall box', () => {
		const r = containRect({ w: 300, h: 600 }, 16 / 9);
		expect(r.w).toBe(300);
		expect(r.h).toBeCloseTo(168.75);
		expect(r.y).toBeCloseTo((600 - 168.75) / 2);
	});
	it('is empty for a zero box or a bad aspect', () => {
		expect(containRect({ w: 0, h: 10 }, 1.7).w).toBe(0);
		expect(containRect({ w: 10, h: 10 }, 0).w).toBe(0);
	});
});

describe('toNormalized', () => {
	const rect = { left: 100, top: 50, width: 400, height: 200 };
	it('maps into 0-1 and clamps outside the frame', () => {
		expect(toNormalized(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
		expect(toNormalized(0, 1000, rect)).toEqual({ x: 0, y: 1 });
	});
});

describe('DrawSession', () => {
	const aspect = 16 / 9;
	it('draws an arrow by dragging', () => {
		const s = new DrawSession('arrow', GOLD, aspect);
		s.press(P(0.1, 0.2));
		s.move(P(0.5, 0.5));
		expect(s.preview()).toMatchObject({ type: 'arrow', a: P(0.1, 0.2), b: P(0.5, 0.5) });
		expect(s.release(P(0.8, 0.9))).toEqual({ v: 1, type: 'arrow', color: GOLD, width: 0.005, a: P(0.1, 0.2), b: P(0.8, 0.9) });
	});
	it('drops a tap that barely moved', () => {
		const s = new DrawSession('line', GOLD, aspect);
		s.press(P(0.5, 0.5));
		expect(s.release(P(0.5005, 0.5))).toBeUndefined();
		expect(s.active).toBe(false);
	});
	it('measures a circle radius as a fraction of width, equal on both axes', () => {
		const across = new DrawSession('circle', GOLD, aspect);
		across.press(P(0.5, 0.5));
		expect((across.release(P(0.6, 0.5)) as any).r).toBeCloseTo(0.1, 4);
		// the same pixel distance straight down is a smaller change in normalized y
		const down = new DrawSession('circle', GOLD, aspect);
		down.press(P(0.5, 0.5));
		expect((down.release(P(0.5, 0.5 + 0.1 * aspect)) as any).r).toBeCloseTo(0.1, 4);
	});
	it('builds an angle from three taps and previews the arms', () => {
		const s = new DrawSession('angle', GOLD, aspect);
		s.press(P(0.2, 0.2));
		expect(s.release(P(0.2, 0.2))).toBeUndefined();
		s.move(P(0.4, 0.5));
		expect(s.preview()).toMatchObject({ type: 'line' });
		s.press(P(0.4, 0.5));
		expect(s.release(P(0.4, 0.5))).toBeUndefined();
		s.move(P(0.7, 0.4));
		expect(s.preview()).toMatchObject({ type: 'angle', vertex: P(0.4, 0.5), b: P(0.7, 0.4) });
		s.press(P(0.7, 0.4));
		expect(s.release(P(0.7, 0.4))).toMatchObject({ type: 'angle', a: P(0.2, 0.2), vertex: P(0.4, 0.5), b: P(0.7, 0.4) });
		expect(s.active).toBe(false);
	});
	it('cancel throws away a half-finished angle', () => {
		const s = new DrawSession('angle', GOLD, aspect);
		s.press(P(0.2, 0.2));
		s.release(P(0.2, 0.2));
		expect(s.active).toBe(true);
		s.cancel();
		expect(s.active).toBe(false);
	});
	it('freehand collects points, simplifies, and ignores a dot', () => {
		const s = new DrawSession('freehand', GOLD, aspect);
		s.press(P(0.1, 0.1));
		for (let i = 1; i <= 200; i++) s.move(P(0.1 + i * 0.003, 0.1 + Math.sin(i / 10) * 0.05));
		const out = s.release(P(0.7, 0.1)) as any;
		expect(out.type).toBe('freehand');
		expect(out.points.length).toBeGreaterThan(5);
		expect(out.points.length).toBeLessThan(150);
		const dot = new DrawSession('freehand', GOLD, aspect);
		dot.press(P(0.3, 0.3));
		expect(dot.release(P(0.3, 0.3))).toBeUndefined();
	});
});

describe('simplifyPath', () => {
	it('keeps a straight line as its two ends', () => {
		const line = Array.from({ length: 50 }, (_, i) => P(i / 49, 0.5));
		expect(simplifyPath(line)).toEqual([P(0, 0.5), P(1, 0.5)]);
	});
	it('never returns more than the cap, even for noise', () => {
		const noise = Array.from({ length: 5000 }, (_, i) => P((i * 7919 % 1000) / 1000, (i * 104729 % 1000) / 1000));
		expect(simplifyPath(noise, 500).length).toBeLessThanOrEqual(500);
	});
});

describe('History', () => {
	it('undo, redo, and a new edit drops redo', () => {
		let h = History.empty<string>().add('a').add('b');
		expect(h.present).toEqual(['a', 'b']);
		h = h.undo();
		expect(h.present).toEqual(['a']);
		expect(h.canRedo).toBe(true);
		expect(h.redo().present).toEqual(['a', 'b']);
		h = h.add('c');
		expect(h.canRedo).toBe(false);
		expect(h.present).toEqual(['a', 'c']);
	});
	it('clear is undoable and does nothing when empty', () => {
		const empty = History.empty<string>();
		expect(empty.clear()).toBe(empty);
		const h = empty.add('a').add('b').clear();
		expect(h.present).toEqual([]);
		expect(h.undo().present).toEqual(['a', 'b']);
	});
	it('undo and redo at the ends are no-ops', () => {
		const h = History.empty<number>();
		expect(h.undo()).toBe(h);
		expect(h.redo()).toBe(h);
	});
});

describe('show-for helpers', () => {
	it('caps the end at the video length', () => {
		expect(endFor(2400, 2000, 10_000)).toBe(4400);
		expect(endFor(9000, 2000, 10_000)).toBe(10_000);
		expect(endFor(2400, null, 10_000)).toBe(10_000);
	});
	it('recognises which option a stored range used', () => {
		expect(showForOf(2400, 4400, 10_000)).toBe(2000);
		expect(showForOf(2400, 10_000, 10_000)).toBe(null);
		expect(showForOf(2400, 3333, 10_000)).toBe('custom');
	});
});
