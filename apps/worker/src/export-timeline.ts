import type { AnnotationShape } from '@ttg/shared';

/**
 * Which annotations are on screen when, for the flattened export. Annotations are visible from `startMs` to `endMs`
 * inclusive (`isVisibleAt`), so the video is cut into intervals at every start and end, and each interval gets the
 * annotations visible through all of it (stacked in the order given). One picture per interval, not per frame.
 */

export interface OverlayInterval {
	readonly startMs: number;
	readonly endMs: number;
	readonly shapes: readonly AnnotationShape[];
}

/** An annotation that starts and ends on one instant (a note on a single frame) still shows for about a frame. */
export const MIN_VISIBLE_MS = 40;

export const overlayIntervals = (
	annotations: readonly { startMs: number; endMs: number; shape: AnnotationShape }[],
	durationMs: number
): OverlayInterval[] => {
	// Visible on the half-open range [start, end), the inclusive end of the stored range becoming the next millisecond.
	const visible = annotations
		.map((a) => ({ start: a.startMs, end: Math.max(a.endMs + 1, a.startMs + MIN_VISIBLE_MS), shape: a.shape }))
		.filter((a) => a.start < durationMs);
	const cuts = new Set<number>([0, durationMs]);
	for (const a of visible) {
		cuts.add(Math.max(0, a.start));
		cuts.add(Math.min(durationMs, a.end));
	}
	const sorted = [...cuts].filter((t) => t >= 0 && t <= durationMs).sort((x, y) => x - y);
	const out: OverlayInterval[] = [];
	for (let i = 0; i < sorted.length - 1; i++) {
		const startMs = sorted[i]!;
		const endMs = sorted[i + 1]!;
		if (endMs <= startMs) continue;
		out.push({ startMs, endMs, shapes: visible.filter((a) => a.start <= startMs && a.end >= endMs).map((a) => a.shape) });
	}
	return out;
};
