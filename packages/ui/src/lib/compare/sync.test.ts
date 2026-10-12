import { describe, expect, it } from 'vitest';
import { SyncController, alignedState, mapTime, type SyncEvent, type SyncTarget } from './sync';

/** A video on a manual clock. Seeks complete (and fire `seeked`) when `flush()` runs, like a real element. */
class FakeVideo implements SyncTarget {
	t = 0;
	isPaused = true;
	isEnded = false;
	r = 1;
	private handlers = new Map<SyncEvent, Set<() => void>>();
	private pendingSeeks = 0;
	seeks: number[] = [];
	constructor(readonly dur: number) {}
	currentMs = () => this.t;
	durationMs = () => this.dur;
	paused = () => this.isPaused;
	ended = () => this.isEnded;
	rate = () => this.r;
	seekMs(ms: number) {
		this.t = Math.min(Math.max(ms, 0), this.dur);
		this.isEnded = false;
		this.seeks.push(ms);
		this.pendingSeeks++;
	}
	play() {
		if (this.isEnded) {
			this.t = 0;
			this.isEnded = false;
		}
		if (!this.isPaused) return;
		this.isPaused = false;
		this.emit('play');
	}
	pause() {
		if (this.isPaused) return;
		this.isPaused = true;
		this.emit('pause');
	}
	setRate(r: number) {
		if (this.r === r) return;
		this.r = r;
		this.emit('ratechange');
	}
	on(event: SyncEvent, h: () => void) {
		if (!this.handlers.has(event)) this.handlers.set(event, new Set());
		this.handlers.get(event)!.add(h);
		return () => this.handlers.get(event)!.delete(h);
	}
	emit(event: SyncEvent) {
		for (const h of [...(this.handlers.get(event) ?? [])]) h();
	}
	flush() {
		while (this.pendingSeeks > 0) {
			this.pendingSeeks--;
			this.emit('seeked');
		}
	}
	/** Let time pass. */
	advance(ms: number) {
		if (this.isPaused) return;
		this.t += ms * this.r;
		if (this.t >= this.dur) {
			this.t = this.dur;
			this.isPaused = true;
			this.isEnded = true;
			this.emit('pause'); // browsers pause, then fire ended
		}
	}
}

const FRAME = 1000 / 30;
const setup = (aDur: number, bDur: number, points = { a: 0, b: 0 }) => {
	const a = new FakeVideo(aDur);
	const b = new FakeVideo(bDur);
	let p = points;
	let clock = 0;
	const c = new SyncController(a, b, { points: () => p, frameMs: () => FRAME, now: () => clock });
	/** Run the page for `ms`, ticking every frame like the player's per-frame callback. */
	const run = (ms: number) => {
		for (let t = 0; t < ms; t += FRAME) {
			a.advance(FRAME);
			b.advance(FRAME);
			clock += FRAME;
			c.tick();
			a.flush();
			b.flush();
		}
	};
	return { a, b, c, run, wait: (ms: number) => (clock += ms), setPoints: (np: { a: number; b: number }) => (p = np) };
};

describe('mapTime / alignedState', () => {
	it('shifts by the difference of sync points and clamps into the target video', () => {
		expect(mapTime(1500, 1000, 3000, 8000)).toEqual({ unclamped: 3500, ms: 3500 });
		expect(mapTime(0, 1000, 500, 8000)).toEqual({ unclamped: -500, ms: 0 });
		expect(mapTime(9000, 0, 0, 4000)).toEqual({ unclamped: 9000, ms: 4000 });
	});
	it('says which end a video is held at', () => {
		expect(alignedState(100, { a: 500, b: 0 }, 4000).held).toBe('start');
		expect(alignedState(500, { a: 500, b: 0 }, 4000).held).toBeNull(); // exactly at the sync point B is playing
		expect(alignedState(2000, { a: 0, b: 0 }, 4000).held).toBeNull();
		expect(alignedState(5000, { a: 0, b: 0 }, 4000).held).toBe('end');
	});
});

describe('SyncController', () => {
	it('moves B to the sync-aligned time when started', () => {
		const { a, b, c } = setup(8000, 8000, { a: 1000, b: 3000 });
		a.t = 2000;
		c.start();
		expect(b.t).toBe(4000);
	});

	it('plays and pauses together, and carries the rate', () => {
		const { a, b, c, wait } = setup(8000, 8000);
		c.start();
		a.play();
		expect(b.isPaused).toBe(false);
		a.setRate(0.5);
		expect(b.r).toBe(0.5);
		a.pause();
		expect(b.isPaused).toBe(true);
		wait(300); // the controller's own pause is no longer "recent"
		b.play(); // from the other video's controls
		expect(a.isPaused).toBe(false);
	});

	it('stays within one frame of the sync-aligned time while playing', () => {
		const { a, b, c, run } = setup(8000, 8000, { a: 1000, b: 2500 });
		a.t = 1000;
		c.start();
		a.play();
		let worst = 0;
		for (let i = 0; i < 120; i++) {
			run(FRAME);
			// B drifts: it decodes slightly slow
			b.t -= 3;
			const want = a.t - 1000 + 2500;
			worst = Math.max(worst, Math.abs(b.t - want));
		}
		// the controller corrects once drift passes one frame; allow the 3 ms the test adds after each correction
		expect(worst).toBeLessThanOrEqual(FRAME + 3.5);
	});

	it('a scrub of A moves B to the matching moment, and B\'s echo does not move A back', () => {
		const { a, b, c } = setup(8000, 8000, { a: 1000, b: 3000 });
		c.start();
		a.seekMs(2500); // the user drags A's slider
		a.flush(); // seeked from the user's seek -> controller follows
		// the seeked of A was our expectation? no: user seeks are not registered, so B follows
		expect(b.t).toBe(4500);
		b.flush(); // B's echo
		expect(a.t).toBe(2500);
	});

	it('a scrub of B moves A to the matching moment', () => {
		const { a, b, c } = setup(8000, 8000, { a: 1000, b: 3000 });
		c.start();
		b.seekMs(5000);
		b.flush();
		expect(a.t).toBe(3000);
		a.flush();
		expect(b.t).toBe(5000);
	});

	it('holds the shorter video on its last frame while the longer one plays on', () => {
		const { a, b, c, run } = setup(10_000, 4000);
		c.start();
		a.play();
		run(5000);
		expect(b.t).toBe(4000);
		expect(b.isEnded).toBe(true);
		// B's own end did not stop A, and B was not restarted
		expect(a.isPaused).toBe(false);
		expect(a.t).toBeGreaterThan(4500);
		run(2000);
		expect(b.t).toBe(4000);
	});

	it('scrubbing A past the end of B parks B on its last frame without dragging A back', () => {
		const { a, b, c } = setup(10_000, 4000);
		c.start();
		a.seekMs(7000);
		a.flush();
		expect(b.t).toBe(4000);
		b.flush();
		expect(a.t).toBe(7000);
	});

	it('B waits on its first frame until A reaches the sync window, then starts', () => {
		const { a, b, c, run } = setup(10_000, 10_000, { a: 2000, b: 0 }); // B starts when A hits 2 s
		c.start();
		a.play();
		run(1000);
		expect(b.t).toBe(0);
		expect(b.isPaused).toBe(true);
		run(1500);
		expect(b.isPaused).toBe(false);
		expect(Math.abs(b.t - (a.t - 2000))).toBeLessThanOrEqual(FRAME * 1.5);
	});

	it('align() re-aims B after the sync points change', () => {
		const { a, b, c, setPoints } = setup(8000, 8000);
		a.t = 2000;
		c.start();
		expect(b.t).toBe(2000);
		setPoints({ a: 2000, b: 500 });
		c.align();
		expect(b.t).toBe(500);
	});

	it('stop() lets the videos go their own ways', () => {
		const { a, b, c } = setup(8000, 8000);
		c.start();
		c.stop();
		a.play();
		expect(b.isPaused).toBe(true);
		a.seekMs(3000);
		a.flush();
		expect(b.t).toBe(0);
	});
});
