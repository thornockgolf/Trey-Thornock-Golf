import type Player from 'video.js/dist/types/player';
import type { SyncEvent, SyncTarget } from './sync';

/** A video.js player as a sync target. */
export const playerTarget = (p: Player): SyncTarget => ({
	currentMs: () => Math.round((p.currentTime() ?? 0) * 1000),
	durationMs: () => Math.round(((p.duration() ?? 0) || 0) * 1000),
	paused: () => p.paused(),
	ended: () => p.ended(),
	rate: () => p.playbackRate() ?? 1,
	seekMs: (ms) => void p.currentTime(ms / 1000),
	play: () => void p.play()?.catch(() => {}),
	pause: () => void p.pause(),
	setRate: (r) => void p.playbackRate(r),
	on: (event: SyncEvent, handler) => {
		p.on(event, handler);
		return () => p.off(event, handler);
	}
});

/** A plain `<video>` element (the overlay video) as a sync target. */
export const elementTarget = (el: HTMLVideoElement): SyncTarget => ({
	currentMs: () => Math.round(el.currentTime * 1000),
	durationMs: () => Math.round((Number.isFinite(el.duration) ? el.duration : 0) * 1000),
	paused: () => el.paused,
	ended: () => el.ended,
	rate: () => el.playbackRate,
	seekMs: (ms) => {
		el.currentTime = ms / 1000;
	},
	play: () => void el.play().catch(() => {}),
	pause: () => el.pause(),
	setRate: (r) => {
		el.playbackRate = r;
	},
	on: (event, handler) => {
		el.addEventListener(event, handler);
		return () => el.removeEventListener(event, handler);
	}
});
