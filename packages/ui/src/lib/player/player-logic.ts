/**
 * Pure helpers for `VideoPlayer`: frame stepping, scrub-sprite cues, time formatting and the limits on
 * refreshing an expired signed URL. No DOM, so they are unit-tested directly.
 */

/** Playback speeds offered in the speed menu (spec 3.C.3: 0.1x to 2x). */
export const PLAYBACK_RATES = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2] as const;

/** Browsers can report a time a hair under a frame boundary; this keeps frame math from slipping a frame. */
const FRAME_EPSILON = 1e-3;
/**
 * Seeks land a little inside a frame, not on its exact boundary, so float rounding can never show the
 * previous frame (29.97 fps boundaries are not representable). Far less than a millisecond at 60 fps.
 */
const SEEK_INSIDE_FRAME = 0.05;

/** Index of the frame shown at `seconds`. */
export const frameAt = (seconds: number, fps: number) => Math.max(0, Math.floor(seconds * fps + FRAME_EPSILON));

/**
 * The time to seek to for a step of `frames` (negative = back) from `seconds`, clamped to the video.
 * One step moves exactly one frame (1/fps) from a time produced by an earlier step.
 */
export const stepTime = (seconds: number, fps: number, frames: number, durationSeconds: number) => {
	if (!(fps > 0)) return clamp(seconds, 0, durationSeconds);
	const target = frameAt(seconds, fps) + frames;
	const lastFrame = Math.max(0, Math.ceil(durationSeconds * fps) - 1);
	const frame = clamp(target, 0, lastFrame);
	return clamp((frame + SEEK_INSIDE_FRAME) / fps, 0, durationSeconds);
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** `m:ss.cc` (or `h:mm:ss.cc`) for the time readout; hundredths so frame steps are visible. */
export const formatClock = (seconds: number) => {
	const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
	const whole = Math.floor(s);
	const cs = Math.floor((s - whole) * 100);
	const h = Math.floor(whole / 3600);
	const m = Math.floor((whole % 3600) / 60);
	const sec = whole % 60;
	const tail = `${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${tail}` : `${m}:${tail}`;
};

export const formatRate = (rate: number) => `${rate}x`;

/** One tile of the scrub sprite: shown for [startMs, endMs). */
export interface SpriteCue {
	readonly startMs: number;
	readonly endMs: number;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

const TIME = /^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})$/;
const toMs = (t: string) => {
	const m = TIME.exec(t.trim());
	if (!m) return null;
	return (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]);
};

/**
 * Parse the worker's `sprite.vtt` (cue payload `sprite.jpg#xywh=x,y,w,h`). The image name is ignored: the
 * caller already holds the signed sprite URL. Malformed cues are skipped.
 */
export const parseSpriteVtt = (text: string): SpriteCue[] => {
	const cues: SpriteCue[] = [];
	const lines = text.replace(/\r/g, '').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const [from, to] = (lines[i] ?? '').split('-->');
		if (to === undefined) continue;
		const start = toMs(from!);
		const end = toMs(to.trim().split(/\s+/)[0]!);
		const xywh = /#xywh=(\d+),(\d+),(\d+),(\d+)/.exec(lines[i + 1] ?? '');
		if (start === null || end === null || !xywh) continue;
		cues.push({ startMs: start, endMs: end, x: Number(xywh[1]), y: Number(xywh[2]), w: Number(xywh[3]), h: Number(xywh[4]) });
	}
	return cues;
};

/** The cue covering `ms` (the last cue for anything past the end, the first for anything before). */
export const cueAt = (cues: readonly SpriteCue[], ms: number): SpriteCue | undefined => {
	if (cues.length === 0) return undefined;
	let lo = 0;
	let hi = cues.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (cues[mid]!.startMs <= ms) lo = mid;
		else hi = mid - 1;
	}
	return cues[lo];
};

/** True when a signed URL's expiry (ISO string) is within `marginMs` of now. Unknown means not expired. */
export const isExpired = (expiresAt: string | null | undefined, now: number, marginMs = 60_000) => {
	const t = Date.parse(expiresAt ?? '');
	return Number.isFinite(t) && now >= t - marginMs;
};

/** At most this many source refreshes within the window, so a broken file cannot loop forever. */
export const MAX_REFRESHES = 3;
export const REFRESH_WINDOW_MS = 60_000;

/** Whether another refresh is allowed given the times (ms) of earlier ones. */
export const canRefresh = (history: readonly number[], now: number) =>
	history.filter((t) => now - t < REFRESH_WINDOW_MS).length < MAX_REFRESHES;

/**
 * MediaError codes worth a URL refresh: network (2) and source not supported/failed to load (4) are what an
 * expired or revoked signed URL produces. Aborted (1) and decode (3) are not fixed by a new URL.
 */
export const isRefreshableMediaError = (code: number | undefined) => code === 2 || code === 4;

/** Sound state of the player. `volume` is the last audible level (0..1) and is kept while muted so unmuting restores it. */
export interface SoundState {
	volume: number;
	muted: boolean;
}

/** Level used when unmuting and there is no earlier audible level to go back to. */
export const DEFAULT_VOLUME = 1;

/** What the slider shows: 0 while muted. */
export const sliderValue = (s: SoundState) => (s.muted ? 0 : s.volume);

/** The slider moved to `value` (0..1): 0 mutes (keeping the previous level), anything above unmutes at that level. */
export const applySlider = (s: SoundState, value: number): SoundState => {
	const v = clamp(Number.isFinite(value) ? value : 0, 0, 1);
	return v <= 0 ? { volume: s.volume, muted: true } : { volume: v, muted: false };
};

/** The speaker button was pressed: mute, or unmute back to the previous level (or the default when that was 0). */
export const toggleMute = (s: SoundState): SoundState => {
	if (!s.muted && s.volume > 0) return { volume: s.volume, muted: true };
	return { volume: s.volume > 0 ? s.volume : DEFAULT_VOLUME, muted: false };
};

export type VolumeIcon = 'off' | 'low' | 'high';

/** Which speaker glyph to show: slashed when muted or silent, one wave under half volume, two waves above. */
export const volumeIcon = (s: SoundState): VolumeIcon => {
	const v = sliderValue(s);
	return v <= 0 ? 'off' : v < 0.5 ? 'low' : 'high';
};

/** Spoken value for the slider, e.g. "75%" or "Muted". */
export const volumeText = (s: SoundState) => (sliderValue(s) <= 0 ? 'Muted' : `${Math.round(sliderValue(s) * 100)}%`);
