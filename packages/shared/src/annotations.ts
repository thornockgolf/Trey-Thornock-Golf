import { Schema } from 'effect';

/**
 * Annotation shapes (spec 3.D.1). Stored as JSON in Postgres, never burned into video. Every coordinate is
 * normalized: x is a fraction of the video width, y a fraction of the video height, so a shape stays correct at any
 * display size. Lengths that are not points (radius, stroke width) are fractions of the video width; text size is a
 * fraction of the video height. Decoding strips unknown properties, so only this allowlist is ever stored.
 */

/** Brand palette from the style guide: gold, white, red, navy, lime. */
export const ANNOTATION_COLORS = ['#D4A017', '#FFFFFF', '#B3261E', '#0E2B5C', '#D9EFA5'] as const;
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

export const MAX_ANNOTATION_BYTES = 16 * 1024;
export const MAX_ANNOTATIONS_PER_VIDEO = 100;
export const MAX_FREEHAND_POINTS = 500;
export const MAX_ANNOTATION_TEXT = 200;

const Unit = Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 0, maximum: 1 })));
const Point = Schema.Struct({ x: Unit, y: Unit });
export type AnnotationPoint = typeof Point.Type;

const Color = Schema.Literals(ANNOTATION_COLORS);
const Width = Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 0.001, maximum: 0.05 })));

const base = { v: Schema.Literal(1), color: Color, width: Width };

const LineShape = Schema.Struct({ ...base, type: Schema.Literal('line'), a: Point, b: Point });
const ArrowShape = Schema.Struct({ ...base, type: Schema.Literal('arrow'), a: Point, b: Point });
const CircleShape = Schema.Struct({
	...base,
	type: Schema.Literal('circle'),
	c: Point,
	r: Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 0.002, maximum: 1 })))
});
/** Two arms from a vertex; the angle between them is drawn and labelled. */
const AngleShape = Schema.Struct({ ...base, type: Schema.Literal('angle'), a: Point, vertex: Point, b: Point });
const FreehandShape = Schema.Struct({
	...base,
	type: Schema.Literal('freehand'),
	points: Schema.Array(Point).pipe(Schema.check(Schema.isMinLength(2), Schema.isMaxLength(MAX_FREEHAND_POINTS)))
});
const TextShape = Schema.Struct({
	...base,
	type: Schema.Literal('text'),
	at: Point,
	text: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_ANNOTATION_TEXT))),
	size: Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 0.01, maximum: 0.2 })))
});

export const AnnotationShape = Schema.Union([LineShape, ArrowShape, CircleShape, AngleShape, FreehandShape, TextShape]);
export type AnnotationShape = typeof AnnotationShape.Type;
export type AnnotationTool = AnnotationShape['type'];

const Ms = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 * 3_600_000 })));
const Version = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)));

export const CreateAnnotationRequest = Schema.Struct({ startMs: Ms, endMs: Ms, shape: AnnotationShape });
export type CreateAnnotationRequest = typeof CreateAnnotationRequest.Type;

/** `version` is the version the client last saw; a stale one is a 409. */
export const UpdateAnnotationRequest = Schema.Struct({
	version: Version,
	startMs: Schema.optional(Ms),
	endMs: Schema.optional(Ms),
	shape: Schema.optional(AnnotationShape)
});
export type UpdateAnnotationRequest = typeof UpdateAnnotationRequest.Type;

/** An annotation as the API returns it. */
export interface AnnotationDto {
	readonly id: string;
	readonly videoId: string;
	readonly authorId: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly shape: AnnotationShape;
	readonly version: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** Whether an annotation is on screen at `ms` (inclusive at both ends, so a 2400-2400 note shows on its frame). */
export const isVisibleAt = (a: { startMs: number; endMs: number }, ms: number) => ms >= a.startMs && ms <= a.endMs;

/** The size of the stored JSON in bytes. */
export const shapeBytes = (shape: unknown) => new TextEncoder().encode(JSON.stringify(shape)).length;

/** Angle in degrees (0-180) at `vertex` between the arms to `a` and `b`, measured in pixels of a `w` x `h` frame. */
export const angleDegrees = (s: { a: AnnotationPoint; vertex: AnnotationPoint; b: AnnotationPoint }, w: number, h: number) => {
	const ax = (s.a.x - s.vertex.x) * w;
	const ay = (s.a.y - s.vertex.y) * h;
	const bx = (s.b.x - s.vertex.x) * w;
	const by = (s.b.y - s.vertex.y) * h;
	const la = Math.hypot(ax, ay);
	const lb = Math.hypot(bx, by);
	if (la === 0 || lb === 0) return 0;
	const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
	return (Math.acos(cos) * 180) / Math.PI;
};

const TOOL_LABEL: Record<AnnotationTool, string> = {
	line: 'Line',
	arrow: 'Arrow',
	circle: 'Circle',
	angle: 'Angle',
	freehand: 'Freehand drawing',
	text: 'Text'
};

/** Text alternative for the annotation list (accessibility): what it is and, for text, what it says. */
export const describeShape = (shape: AnnotationShape, w = 16, h = 9) => {
	if (shape.type === 'text') return `Text: ${shape.text}`;
	if (shape.type === 'angle') return `Angle, ${Math.round(angleDegrees(shape, w, h))}°`;
	return TOOL_LABEL[shape.type];
};
