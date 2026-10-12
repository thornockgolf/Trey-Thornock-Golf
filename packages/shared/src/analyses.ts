import { Schema } from 'effect';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const Uuid = Schema.String.pipe(Schema.check(Schema.isPattern(UUID_RE)));

const Ms = Schema.Number.pipe(Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 24 * 3_600_000 })));
const Num = (minimum: number, maximum: number) => Schema.Number.pipe(Schema.check(Schema.isFinite(), Schema.isBetween({ minimum, maximum })));

/** Start an analysis of a video (coach only). */
export const CreateAnalysisRequest = Schema.Struct({
	videoId: Uuid,
	title: Schema.optional(Schema.String.pipe(Schema.check(Schema.isMaxLength(120))))
});
export type CreateAnalysisRequest = typeof CreateAnalysisRequest.Type;

export interface AnalysisDto {
	readonly id: string;
	readonly videoId: string;
	readonly coachId: string;
	readonly title: string | null;
	readonly createdAt: string;
}

/**
 * How a second video is laid over the base video (spec 3.D.2). `scale` multiplies the overlay's own fitted size;
 * `x` and `y` shift it by a fraction of the frame's width and height; the sync points are the moments (ms) in each
 * video that count as the same instant (address, impact).
 */
export const OverlaySettings = Schema.Struct({
	overlayVideoId: Schema.NullOr(Uuid),
	opacity: Num(0.1, 1),
	scale: Num(0.25, 3),
	x: Num(-0.5, 0.5),
	y: Num(-0.5, 0.5),
	baseSyncMs: Ms,
	overlaySyncMs: Ms
});
export type OverlaySettings = typeof OverlaySettings.Type;

export const DEFAULT_OVERLAY: OverlaySettings = {
	overlayVideoId: null,
	opacity: 0.5,
	scale: 1,
	x: 0,
	y: 0,
	baseSyncMs: 0,
	overlaySyncMs: 0
};

/** Stored settings (`'{}'` until the coach saves) as a full, valid object. Anything invalid falls back to the defaults. */
export const readOverlay = (stored: unknown): OverlaySettings => {
	if (stored && typeof stored === 'object') {
		try {
			return Schema.decodeUnknownSync(OverlaySettings)({ ...DEFAULT_OVERLAY, ...(stored as object) });
		} catch {
			// fall through
		}
	}
	return DEFAULT_OVERLAY;
};

/** `GET /api/analyses/:id/overlay`. */
export interface OverlayResponse {
	readonly analysisId: string;
	readonly videoId: string;
	readonly settings: OverlaySettings;
}
