import { MAX_FREEHAND_POINTS, type AnnotationColor, type AnnotationPoint, type AnnotationShape, type AnnotationTool } from '@ttg/shared';

/** Stroke width as a fraction of the video width (about 3 px at 640 px wide, 5 px at 960). */
export const DEFAULT_STROKE = 0.005;
export const DEFAULT_TEXT_SIZE = 0.05;

const MIN_LINE = 0.01;
const MIN_RADIUS = 0.005;

export interface Size {
	w: number;
	h: number;
}

/** The rectangle a video of `aspect` (width / height) occupies inside a box, centered and letterboxed ("contain"). */
export const containRect = (box: Size, aspect: number) => {
	if (box.w <= 0 || box.h <= 0 || !(aspect > 0)) return { x: 0, y: 0, w: 0, h: 0 };
	const boxAspect = box.w / box.h;
	const w = boxAspect > aspect ? box.h * aspect : box.w;
	const h = boxAspect > aspect ? box.h : box.w / aspect;
	return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A pointer position inside the canvas element as a normalized point, clamped to the frame. */
export const toNormalized = (clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): AnnotationPoint => ({
	x: rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0,
	y: rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0
});

const perpDistance = (p: AnnotationPoint, a: AnnotationPoint, b: AnnotationPoint) => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy);
	if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
	return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
};

const rdp = (pts: readonly AnnotationPoint[], eps: number): AnnotationPoint[] => {
	if (pts.length < 3) return [...pts];
	let maxD = 0;
	let idx = 0;
	for (let i = 1; i < pts.length - 1; i++) {
		const d = perpDistance(pts[i]!, pts[0]!, pts[pts.length - 1]!);
		if (d > maxD) {
			maxD = d;
			idx = i;
		}
	}
	if (maxD <= eps) return [pts[0]!, pts[pts.length - 1]!];
	return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
};

/** Round to 4 decimals (about 0.1 px at 1080p): keeps the stored JSON small. */
const round = (p: AnnotationPoint): AnnotationPoint => ({ x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4 });

/** Reduce a freehand path to at most `max` points (Ramer-Douglas-Peucker with a growing tolerance). */
export const simplifyPath = (points: readonly AnnotationPoint[], max = MAX_FREEHAND_POINTS): AnnotationPoint[] => {
	let eps = 0.0008;
	let out = rdp(points, eps);
	while (out.length > max && eps < 0.5) {
		eps *= 1.6;
		out = rdp(points, eps);
	}
	return out.slice(0, max).map(round);
};

/** Distance as a fraction of the video width (a y step is divided by the aspect so both axes use the same unit). */
const dist = (a: AnnotationPoint, b: AnnotationPoint, aspect: number) => Math.hypot(a.x - b.x, (a.y - b.y) / aspect);

/**
 * Turns pointer events into one shape. No DOM here, so it is unit-tested. `aspect` is the video's width / height, so
 * distances (circle radius, minimum size) are measured in the same units on both axes.
 *
 * line, arrow, circle, freehand: press, drag, release. angle: tap the end of the first arm, the vertex, then the
 * end of the second arm. text: a tap returns the position and the UI asks for the words.
 */
export class DrawSession {
	private points: AnnotationPoint[] = [];
	private down = false;
	private hover: AnnotationPoint | undefined;

	constructor(
		readonly tool: AnnotationTool,
		readonly color: AnnotationColor,
		readonly aspect: number,
		readonly width = DEFAULT_STROKE
	) {}

	/** Pointer pressed. */
	press(p: AnnotationPoint) {
		this.down = true;
		this.hover = p;
		if (this.tool === 'angle') return;
		this.points = [p];
	}

	/** Pointer moved (pressed or not; the angle tool previews while hovering). */
	move(p: AnnotationPoint) {
		this.hover = p;
		if (!this.down || this.tool === 'angle') return;
		if (this.tool === 'freehand') {
			const last = this.points[this.points.length - 1]!;
			if (dist(last, p, this.aspect) > 0.002) this.points.push(p);
		} else {
			this.points = [this.points[0]!, p];
		}
	}

	/**
	 * Pointer released. Returns the finished shape, or undefined when more input is needed or the gesture was too
	 * small to keep. For `text` it returns the tapped position through `textAt` instead (see the UI).
	 */
	release(p: AnnotationPoint): AnnotationShape | undefined {
		this.down = false;
		this.hover = p;
		const base = { v: 1 as const, color: this.color, width: this.width };
		switch (this.tool) {
			case 'line':
			case 'arrow': {
				const a = this.points[0];
				if (!a || dist(a, p, this.aspect) < MIN_LINE) return this.reset();
				this.reset();
				return { ...base, type: this.tool, a: round(a), b: round(p) };
			}
			case 'circle': {
				const c = this.points[0];
				if (!c) return this.reset();
				const r = dist(c, p, this.aspect);
				if (r < MIN_RADIUS) return this.reset();
				this.reset();
				return { ...base, type: 'circle', c: round(c), r: Math.min(1, Math.round(r * 1e4) / 1e4) };
			}
			case 'freehand': {
				this.points.push(p);
				const pts = simplifyPath(this.points);
				const spans = this.points.some((q) => dist(q, this.points[0]!, this.aspect) >= MIN_LINE);
				this.reset();
				return pts.length >= 2 && spans ? { ...base, type: 'freehand', points: pts } : undefined;
			}
			case 'angle': {
				this.points.push(p);
				if (this.points.length < 3) return undefined;
				const [a, vertex, b] = this.points as [AnnotationPoint, AnnotationPoint, AnnotationPoint];
				this.reset();
				if (dist(a, vertex, this.aspect) < MIN_LINE || dist(b, vertex, this.aspect) < MIN_LINE) return undefined;
				return { ...base, type: 'angle', a: round(a), vertex: round(vertex), b: round(b) };
			}
			case 'text':
				return undefined;
		}
	}

	cancel() {
		this.reset();
	}

	private reset(): undefined {
		this.points = [];
		this.down = false;
		return undefined;
	}

	/** Whether the gesture is partway (an angle with taps already placed, or a drag in progress). */
	get active() {
		return this.points.length > 0 || this.down;
	}

	/** The shape being drawn, for a live preview; undefined until there is enough to show. */
	preview(): AnnotationShape | undefined {
		const base = { v: 1 as const, color: this.color, width: this.width };
		const h = this.hover;
		switch (this.tool) {
			case 'line':
			case 'arrow':
				return this.down && this.points.length === 2 ? { ...base, type: this.tool, a: this.points[0]!, b: this.points[1]! } : undefined;
			case 'circle':
				if (!this.down || this.points.length !== 2) return undefined;
				return { ...base, type: 'circle', c: this.points[0]!, r: Math.max(MIN_RADIUS, dist(this.points[0]!, this.points[1]!, this.aspect)) };
			case 'freehand':
				return this.points.length >= 2 ? { ...base, type: 'freehand', points: this.points.slice(-MAX_FREEHAND_POINTS) } : undefined;
			case 'angle': {
				if (!h || this.points.length === 0) return undefined;
				if (this.points.length === 1) return { ...base, type: 'line', a: this.points[0]!, b: h };
				return { ...base, type: 'angle', a: this.points[0]!, vertex: this.points[1]!, b: h };
			}
			case 'text':
				return undefined;
		}
	}
}

/** Undo/redo over a list of drafts. Immutable: every method returns a new History. */
export class History<T> {
	private constructor(
		readonly present: readonly T[],
		private readonly past: readonly (readonly T[])[],
		private readonly future: readonly (readonly T[])[]
	) {}
	static empty<T>() {
		return new History<T>([], [], []);
	}
	get canUndo() {
		return this.past.length > 0;
	}
	get canRedo() {
		return this.future.length > 0;
	}
	/** Replace the list with a new one (new edits drop the redo stack). */
	set(next: readonly T[]) {
		return new History(next, [...this.past, this.present], []);
	}
	add(item: T) {
		return this.set([...this.present, item]);
	}
	undo() {
		if (!this.canUndo) return this;
		return new History(this.past[this.past.length - 1]!, this.past.slice(0, -1), [this.present, ...this.future]);
	}
	redo() {
		if (!this.canRedo) return this;
		return new History(this.future[0]!, [...this.past, this.present], this.future.slice(1));
	}
	/** Remove everything; undo brings it back. A no-op on an empty list. */
	clear() {
		return this.present.length === 0 ? this : this.set([]);
	}
	/** Forget history (after a save). */
	reset() {
		return History.empty<T>();
	}
}

/** How long a new annotation stays on screen. `null` means "until the end of the video". */
export const SHOW_FOR_OPTIONS = [
	{ label: '1 second', ms: 1000 },
	{ label: '2 seconds', ms: 2000 },
	{ label: '3 seconds', ms: 3000 },
	{ label: '5 seconds', ms: 5000 },
	{ label: 'Until the end', ms: null }
] as const;

export const endFor = (startMs: number, showForMs: number | null, durationMs: number) =>
	Math.min(durationMs, showForMs === null ? durationMs : startMs + showForMs);

/** Which showFor option an existing range matches, for the edit select (or 'custom'). */
export const showForOf = (startMs: number, endMs: number, durationMs: number): number | null | 'custom' => {
	for (const o of SHOW_FOR_OPTIONS) if (endFor(startMs, o.ms, durationMs) === endMs) return o.ms;
	return 'custom';
};
