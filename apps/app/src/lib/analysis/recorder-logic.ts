import { MAX_SEGMENT_MS, MIN_SEGMENT_MS, SEGMENT_TYPES, type SegmentContentType } from '@ttg/shared';

/**
 * MediaRecorder formats to try, best first. Chrome, Edge and Firefox record WebM, Safari records MP4; the worker turns
 * whatever arrives into MP4/AAC. The base type (before `;codecs=`) is what the server accepts and the upload signs.
 */
const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'] as const;
const VIDEO_TYPES = [
	'video/webm;codecs=vp9,opus',
	'video/webm;codecs=vp8,opus',
	'video/webm',
	'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
	'video/mp4'
] as const;

export const baseType = (mime: string) => mime.split(';')[0]!.trim().toLowerCase();

export interface RecorderType {
	/** What to give `new MediaRecorder(stream, { mimeType })`. */
	mimeType: string;
	/** What to tell the server and sign the upload with. */
	contentType: SegmentContentType;
}

/** The first format this browser can record that the server accepts, or undefined (no MediaRecorder support for it). */
export const pickRecorderType = (withCamera: boolean, isSupported: (mime: string) => boolean): RecorderType | undefined => {
	for (const mimeType of withCamera ? VIDEO_TYPES : AUDIO_TYPES) {
		const base = baseType(mimeType);
		if (base in SEGMENT_TYPES && isSupported(mimeType)) return { mimeType, contentType: base as SegmentContentType };
	}
	return undefined;
};

/** Modest bitrates: the voice is the point, and a 5 minute camera take stays well under the upload limit. */
export const recorderBitrates = (withCamera: boolean) => ({
	audioBitsPerSecond: 64_000,
	...(withCamera ? { videoBitsPerSecond: 800_000 } : {})
});

export interface RecordedRange {
	startMs: number;
	endMs: number;
}

/** Why a range cannot be recorded, in words for the coach; undefined when it is fine. */
export const rangeProblem = (r: RecordedRange, durationMs: number): string | undefined => {
	if (!Number.isInteger(r.startMs) || !Number.isInteger(r.endMs) || r.startMs < 0) return 'Pick a start and an end inside the video.';
	if (r.endMs > durationMs) return 'The end is past the end of the video.';
	if (r.endMs - r.startMs < MIN_SEGMENT_MS) return 'That part is too short. Pick at least half a second.';
	if (r.endMs - r.startMs > MAX_SEGMENT_MS) return 'That part is too long to record in one go.';
	return undefined;
};

/**
 * The range a finished take covers: it started where the video was when recording began and stopped where the video
 * was when it stopped (the coach pressing Stop early shortens it). Clamped to the video.
 */
export const takeRange = (startedAtMs: number, stoppedAtMs: number, durationMs: number): RecordedRange => ({
	startMs: Math.max(0, Math.round(startedAtMs)),
	endMs: Math.min(durationMs, Math.round(stoppedAtMs))
});

export interface BarSegment {
	id: string;
	startMs: number;
	endMs: number;
	/** Percent of the bar, for CSS. */
	left: number;
	width: number;
}

/** Position the live segments on a bar the length of the video. */
export const barLayout = (segments: readonly { id: string; startMs: number; endMs: number }[], durationMs: number): BarSegment[] =>
	durationMs <= 0
		? []
		: segments.map((s) => {
				const left = Math.min(100, Math.max(0, (s.startMs / durationMs) * 100));
				const right = Math.min(100, Math.max(0, (s.endMs / durationMs) * 100));
				return { id: s.id, startMs: s.startMs, endMs: s.endMs, left, width: Math.max(0.5, right - left) };
			});

/** `m:ss.t` for a time in ms (tenths, because ranges are chosen by eye). */
export const formatMs = (ms: number) => {
	const t = Math.max(0, Math.round(ms / 100));
	const m = Math.floor(t / 600);
	const s = Math.floor((t % 600) / 10);
	return `${m}:${String(s).padStart(2, '0')}.${t % 10}`;
};

/** Elapsed recording time as `m:ss`. */
export const formatElapsed = (ms: number) => {
	const s = Math.floor(Math.max(0, ms) / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A readable reason for a getUserMedia failure. */
export const mediaErrorMessage = (e: unknown, withCamera: boolean) => {
	const name = (e as { name?: string } | undefined)?.name;
	if (name === 'NotAllowedError' || name === 'SecurityError') {
		return `Allow the microphone${withCamera ? ' and camera' : ''} for this site in your browser, then try again.`;
	}
	if (name === 'NotFoundError' || name === 'OverconstrainedError') {
		return withCamera ? 'No camera or microphone was found. Turn the camera off to record voice only.' : 'No microphone was found.';
	}
	if (name === 'NotReadableError') return 'Another app is using the microphone or camera.';
	return 'Recording could not start in this browser.';
};
