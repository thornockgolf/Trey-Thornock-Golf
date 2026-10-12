/**
 * Keeps two videos aligned from a sync point in each (spec 3.D.2). No DOM here: it drives two `SyncTarget`s, so the
 * rules are tested with fakes and the same controller runs on video.js players and plain `<video>` elements.
 *
 * Mapping: when A is at time `tA`, B should be at `tA - a.sync + b.sync`, held at its first or last frame when that
 * falls outside B (so the shorter video waits at the start and holds its last frame at the end).
 */

export type SyncEvent = 'play' | 'pause' | 'seeked' | 'ratechange';

/** What the controller needs from a video. Times are milliseconds. */
export interface SyncTarget {
	currentMs(): number;
	durationMs(): number;
	paused(): boolean;
	ended(): boolean;
	rate(): number;
	seekMs(ms: number): void;
	play(): void;
	pause(): void;
	setRate(rate: number): void;
	/** Subscribe to a media event; returns the unsubscribe function. */
	on(event: SyncEvent, handler: () => void): () => void;
}

export interface SyncOptions {
	/** Sync point in each video, in ms. Read on every call so edits apply immediately. */
	points: () => { a: number; b: number };
	/** One frame in ms (the larger of the two videos' frame times). Seeks closer than this are skipped. */
	frameMs: () => number;
	now?: () => number;
}

/** Where `to` should be when `from` is at `ms`. `unclamped` may fall outside the video. */
export const mapTime = (ms: number, fromPoint: number, toPoint: number, toDuration: number) => {
	const unclamped = ms - fromPoint + toPoint;
	return { unclamped, ms: Math.min(Math.max(unclamped, 0), toDuration) };
};

/** Where B should be for a given A time, and whether B is "in range" (playing along) or held at an end. */
export const alignedState = (aMs: number, p: { a: number; b: number }, bDuration: number) => {
	const m = mapTime(aMs, p.a, p.b, bDuration);
	return { ...m, held: m.unclamped < 0 ? ('start' as const) : m.unclamped >= bDuration ? ('end' as const) : null };
};

const STALE_MS = 2000;

export class SyncController {
	#offs: (() => void)[] = [];
	#expect: { a: { ms: number; at: number } | null; b: { ms: number; at: number } | null } = { a: null, b: null };
	#quiet = { a: 0, b: 0 };
	#on = false;
	readonly #now: () => number;

	constructor(
		private readonly a: SyncTarget,
		private readonly b: SyncTarget,
		private readonly opts: SyncOptions
	) {
		this.#now = opts.now ?? (() => performance.now());
	}

	get enabled() {
		return this.#on;
	}

	/** Start keeping the two aligned. B is moved to match A right away. */
	start() {
		if (this.#on) return;
		this.#on = true;
		this.#offs = [...this.#hook('a', this.a, this.b), ...this.#hook('b', this.b, this.a)];
		this.align();
	}

	stop() {
		this.#on = false;
		for (const off of this.#offs) off();
		this.#offs = [];
	}

	/** Move B to match A now (after the sync points changed, for example). A's play state and rate carry over. */
	align() {
		if (!this.#on) return;
		this.#follow('a');
		this.b.setRate(this.a.rate());
	}

	/** Call on every displayed frame of A while playing: starts, holds and corrects drift of B. */
	tick() {
		if (!this.#on) return;
		const state = alignedState(this.a.currentMs(), this.opts.points(), this.b.durationMs());
		const aPlaying = !this.a.paused() && !this.a.ended();
		if (aPlaying) {
			const inRange = state.held === null;
			if (inRange && this.b.paused() && !this.b.ended()) {
				this.#drive('b', () => this.b.play());
			} else if (!inRange && !this.b.paused()) {
				this.#drive('b', () => this.b.pause());
			}
			if (inRange && Math.abs(this.b.currentMs() - state.ms) > this.opts.frameMs()) this.#seek('b', this.b, state.ms);
		}
	}

	/** Mark a programmatic play/pause so the echo event is not mistaken for the user. */
	#drive(which: 'a' | 'b', fn: () => void) {
		this.#quiet[which] = this.#now() + 250;
		fn();
	}

	#seek(which: 'a' | 'b', t: SyncTarget, ms: number) {
		this.#expect[which] = { ms, at: this.#now() };
		t.seekMs(ms);
	}

	/** Re-aim `to` from `from`'s current time. `fromKey` names the leader. */
	#follow(fromKey: 'a' | 'b') {
		const from = fromKey === 'a' ? this.a : this.b;
		const to = fromKey === 'a' ? this.b : this.a;
		const toKey = fromKey === 'a' ? 'b' : 'a';
		const p = this.opts.points();
		const pts = fromKey === 'a' ? p : { a: p.b, b: p.a };
		const target = mapTime(from.currentMs(), pts.a, pts.b, to.durationMs());
		if (Math.abs(to.currentMs() - target.ms) > this.opts.frameMs() / 2) this.#seek(toKey, to, target.ms);
		const held = target.unclamped < 0 || target.unclamped >= to.durationMs();
		if (held) {
			if (!to.paused()) this.#drive(toKey, () => to.pause());
		} else if (!from.paused() && to.paused()) {
			this.#drive(toKey, () => to.play());
		} else if (from.paused() && !to.paused()) {
			this.#drive(toKey, () => to.pause());
		}
	}

	#hook(key: 'a' | 'b', from: SyncTarget, to: SyncTarget) {
		const other = key === 'a' ? 'b' : 'a';
		const quiet = () => this.#now() < this.#quiet[key];
		return [
			from.on('play', () => {
				if (quiet()) return;
				this.#follow(key);
			}),
			from.on('pause', () => {
				// a video reaching its own end pauses itself; that must not stop the other one
				if (quiet() || from.ended()) return;
				if (!to.paused()) this.#drive(other, () => to.pause());
			}),
			from.on('seeked', () => {
				const exp = this.#expect[key];
				if (exp && this.#now() - exp.at < STALE_MS && Math.abs(from.currentMs() - exp.ms) <= this.opts.frameMs() * 2) {
					this.#expect[key] = null; // our own seek coming back
					return;
				}
				this.#expect[key] = null;
				this.#follow(key);
			}),
			from.on('ratechange', () => {
				if (to.rate() !== from.rate()) to.setRate(from.rate());
			})
		];
	}
}
