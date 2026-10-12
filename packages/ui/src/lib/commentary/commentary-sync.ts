/**
 * Plays the coach's analysis recordings alongside the video (manifest-based playback, spec 3.D.3): each segment is its
 * own clip, played from `clipStartMs` for the length of its slot of the timeline. No DOM here; the clips are
 * `ClipTarget`s, so the rules are tested with fakes.
 */

export interface CommentarySegment {
	readonly id: string;
	readonly startMs: number;
	readonly endMs: number;
	readonly clipStartMs: number;
	readonly hasVideo: boolean;
	readonly url: string;
}

/** One playable clip (an audio or video element). Times are milliseconds. */
export interface ClipTarget {
	currentMs(): number;
	seekMs(ms: number): void;
	paused(): boolean;
	play(): void;
	pause(): void;
	rate(): number;
	setRate(rate: number): void;
}

/** The segment whose slot contains `tMs` (start inclusive, end exclusive), if any. Segments do not overlap. */
export const activeSegment = (segments: readonly CommentarySegment[], tMs: number) =>
	segments.find((s) => tMs >= s.startMs && tMs < s.endMs);

/** Where in the segment's clip the timeline time `tMs` falls. */
export const clipTime = (seg: Pick<CommentarySegment, 'startMs' | 'clipStartMs'>, tMs: number) => tMs - seg.startMs + seg.clipStartMs;

/** A clip further than this from where it should be is moved (about the limit of what a listener notices). */
export const DRIFT_MS = 250;

export class CommentarySync {
	constructor(
		private segments: readonly CommentarySegment[],
		/** The clip for a segment (segments cut from one recording share one). */
		private readonly target: (seg: CommentarySegment) => ClipTarget | undefined,
		private readonly driftMs = DRIFT_MS
	) {}

	setSegments(segments: readonly CommentarySegment[]) {
		this.segments = segments;
	}

	/**
	 * Bring the clips in line with the video: `tMs` is the video's time, `playing` whether it is playing. Call on every
	 * displayed frame; pass `exact` after a seek to move the clip even when it is only a little off.
	 */
	update(tMs: number, playing: boolean, rate: number, exact = false) {
		const active = activeSegment(this.segments, tMs);
		const activeTarget = active ? this.target(active) : undefined;
		// every other clip is silent
		for (const seg of this.segments) {
			const t = this.target(seg);
			if (t && t !== activeTarget && !t.paused()) t.pause();
		}
		if (!active || !activeTarget) return;
		const want = clipTime(active, tMs);
		if (exact || Math.abs(activeTarget.currentMs() - want) > this.driftMs) activeTarget.seekMs(want);
		if (activeTarget.rate() !== rate) activeTarget.setRate(rate);
		if (playing && activeTarget.paused()) activeTarget.play();
		else if (!playing && !activeTarget.paused()) activeTarget.pause();
	}

	/** Silence everything (the video paused far from any segment, or the page is going away). */
	stop() {
		for (const seg of this.segments) {
			const t = this.target(seg);
			if (t && !t.paused()) t.pause();
		}
	}
}
