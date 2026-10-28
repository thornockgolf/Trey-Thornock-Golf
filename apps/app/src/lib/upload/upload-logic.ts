/**
 * Pure upload logic: file validation, the upload state machine, retry policy, error messages and
 * formatting. No Svelte, no Uppy, no network, so it is unit-tested directly.
 */
import { MAX_VIDEO_BYTES, VIDEO_TYPES, type VideoContentType, type VideoDto } from '@ttg/shared';

// ---------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------

export interface FileInfo {
	readonly name: string;
	readonly sizeBytes: number;
	readonly contentType: VideoContentType;
}

/** What the file pickers accept. "Record a swing" uses `video/*` so phone cameras work; we check after. */
export const ACCEPT_ATTR = Object.keys(VIDEO_TYPES).join(',');

const EXTENSION_TYPES: Record<string, VideoContentType> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime', webm: 'video/webm' };

/** The upload content type for a file: its MIME type if we accept it, else a guess from the extension (some browsers leave `type` empty). */
export const contentTypeOf = (file: { name: string; type: string }): VideoContentType | null => {
	const type = file.type.toLowerCase().split(';')[0]!.trim();
	if (type in VIDEO_TYPES) return type as VideoContentType;
	if (type && type !== 'application/octet-stream') return null;
	const ext = file.name.toLowerCase().split('.').pop() ?? '';
	return EXTENSION_TYPES[ext] ?? null;
};

export type Validation = { ok: true; file: FileInfo } | { ok: false; message: string };

/** Client-side check for a readable message before any request. The server re-checks (it is the authority). */
export const validateFile = (file: { name: string; type: string; size: number }): Validation => {
	const contentType = contentTypeOf(file);
	if (!contentType) return { ok: false, message: `"${file.name}" isn't a supported video. Use an MP4, MOV or WebM file.` };
	if (file.size <= 0) return { ok: false, message: `"${file.name}" is empty. Choose another video.` };
	if (file.size > MAX_VIDEO_BYTES) {
		return { ok: false, message: `"${file.name}" is ${formatBytes(file.size)}. Videos can be up to ${formatBytes(MAX_VIDEO_BYTES)}; trim it and try again.` };
	}
	return { ok: true, file: { name: file.name, sizeBytes: file.size, contentType } };
};

// ---------------------------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------------------------

export interface Progress {
	readonly bytesUploaded: number;
	readonly bytesTotal: number;
	/** 0 to 100, whole numbers. */
	readonly percent: number;
	/** Bytes per second, or null until there is enough data. */
	readonly speedBps: number | null;
}

/** Where an error happened decides what Retry does: re-send the bytes, or re-confirm with `/complete`. */
export type ErrorStage = 'validation' | 'upload' | 'complete';

export type UploadState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'selected'; readonly file: FileInfo }
	| { readonly kind: 'uploading'; readonly file: FileInfo; readonly progress: Progress }
	| { readonly kind: 'paused'; readonly file: FileInfo; readonly progress: Progress; readonly reason: 'user' | 'offline' }
	| { readonly kind: 'finalizing'; readonly file: FileInfo }
	| { readonly kind: 'success'; readonly file: FileInfo; readonly video: VideoDto }
	| {
			readonly kind: 'error';
			readonly file: FileInfo | null;
			readonly stage: ErrorStage;
			readonly message: string;
			/** Bytes already sent, so the UI can keep showing them while offering Retry. */
			readonly progress: Progress | null;
	  };

export type UploadEvent =
	| { readonly type: 'picked'; readonly file: FileInfo }
	| { readonly type: 'rejected'; readonly message: string }
	| { readonly type: 'start' }
	| { readonly type: 'progress'; readonly progress: Progress }
	| { readonly type: 'pause'; readonly reason: 'user' | 'offline' }
	| { readonly type: 'resume' }
	| { readonly type: 'bytes-done' }
	| { readonly type: 'completed'; readonly video: VideoDto }
	| { readonly type: 'failed'; readonly stage: ErrorStage; readonly message: string }
	| { readonly type: 'retry' }
	| { readonly type: 'reset' };

export const idle: UploadState = { kind: 'idle' };

export const emptyProgress = (bytesTotal: number): Progress => ({ bytesUploaded: 0, bytesTotal, percent: 0, speedBps: null });

const fileOf = (s: UploadState): FileInfo | null => ('file' in s ? s.file : null);
const progressOf = (s: UploadState): Progress | null => ('progress' in s ? s.progress : null);

/**
 * The upload state machine. Events that make no sense in the current state are ignored (the state
 * is returned unchanged), so late callbacks from a cancelled upload can't resurrect it.
 */
export const transition = (state: UploadState, event: UploadEvent): UploadState => {
	switch (event.type) {
		case 'picked':
			return isBusy(state) ? state : { kind: 'selected', file: event.file };
		case 'rejected':
			return isBusy(state) ? state : { kind: 'error', file: null, stage: 'validation', message: event.message, progress: null };
		case 'start':
			return state.kind === 'selected' ? { kind: 'uploading', file: state.file, progress: emptyProgress(state.file.sizeBytes) } : state;
		case 'progress':
			if (state.kind === 'uploading') return { ...state, progress: event.progress };
			// keep counting bytes that land while paused (an in-flight part can finish), but stay paused
			if (state.kind === 'paused') return { ...state, progress: { ...event.progress, speedBps: null } };
			return state;
		case 'pause':
			if (state.kind === 'uploading') return { kind: 'paused', file: state.file, progress: { ...state.progress, speedBps: null }, reason: event.reason };
			// a user pause wins over an offline pause, so coming back online doesn't resume it
			if (state.kind === 'paused' && event.reason === 'user') return { ...state, reason: 'user' };
			return state;
		case 'resume':
			return state.kind === 'paused' ? { kind: 'uploading', file: state.file, progress: state.progress } : state;
		case 'bytes-done':
			return state.kind === 'uploading' || state.kind === 'paused' ? { kind: 'finalizing', file: state.file } : state;
		case 'completed':
			// never show success unless we were waiting on /complete
			return state.kind === 'finalizing' ? { kind: 'success', file: state.file, video: event.video } : state;
		case 'failed': {
			if (state.kind === 'idle' || state.kind === 'success' || state.kind === 'error') return state;
			return { kind: 'error', file: fileOf(state), stage: event.stage, message: event.message, progress: progressOf(state) };
		}
		case 'retry':
			if (state.kind !== 'error' || !state.file || state.stage === 'validation') return state;
			if (state.stage === 'complete') return { kind: 'finalizing', file: state.file };
			return { kind: 'uploading', file: state.file, progress: state.progress ?? emptyProgress(state.file.sizeBytes) };
		case 'reset':
			return idle;
	}
};

/** An upload is in flight (bytes or confirmation): picking another file must wait for Cancel. */
export const isBusy = (s: UploadState) => s.kind === 'uploading' || s.kind === 'paused' || s.kind === 'finalizing';

/** Retry is offered for upload and confirmation errors, not for a rejected file. */
export const canRetry = (s: UploadState) => s.kind === 'error' && s.stage !== 'validation' && s.file !== null;

export const percentOf = (bytesUploaded: number, bytesTotal: number) =>
	bytesTotal <= 0 ? 0 : Math.min(100, Math.max(0, Math.floor((bytesUploaded / bytesTotal) * 100)));

// ---------------------------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------------------------

/**
 * Upload speed over a sliding window of recent samples. Pausing or a byte count that goes
 * backwards (a part restarted after a retry) resets it.
 */
export class SpeedMeter {
	#samples: { t: number; bytes: number }[] = [];
	constructor(private readonly windowMs = 5_000) {}

	sample(bytes: number, t: number): number | null {
		const last = this.#samples.at(-1);
		if (last && bytes < last.bytes) this.#samples = [];
		this.#samples.push({ t, bytes });
		while (this.#samples.length > 2 && t - this.#samples[0]!.t > this.windowMs) this.#samples.shift();
		const first = this.#samples[0]!;
		const dt = t - first.t;
		if (dt < 500) return null;
		return ((bytes - first.bytes) * 1000) / dt;
	}

	reset() {
		this.#samples = [];
	}
}

// ---------------------------------------------------------------------------------------------
// Errors and retry
// ---------------------------------------------------------------------------------------------

/** A non-2xx response from our API (`{ code, message }`) or from the storage PUT. */
export class HttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: string | null,
		message: string,
		/** 'api' for our server, 'storage' for a presigned R2 request. */
		readonly source: 'api' | 'storage' = 'api'
	) {
		super(message);
		this.name = 'HttpError';
	}
}

/** The request never got a response (offline, DNS, CORS, connection reset). */
export class NetworkError extends Error {
	constructor(message = 'Network request failed') {
		super(message);
		this.name = 'NetworkError';
	}
}

/** Storage accepted a part but the ETag header was not readable (bucket CORS must expose it). */
export class MissingEtagError extends Error {
	constructor() {
		super('Storage did not return an ETag');
		this.name = 'MissingEtagError';
	}
}

export const isAbortError = (e: unknown) => e instanceof Error && e.name === 'AbortError';

/** Worth retrying automatically: no response, a server hiccup, or rate limiting. Never 4xx client errors. */
export const isTransient = (e: unknown) =>
	e instanceof NetworkError || (e instanceof HttpError && (e.status >= 500 || e.status === 408 || e.status === 429));

/** Backoff before automatic retry `attempt` (1-based): 1 s, 2 s, 4 s, 8 s, capped at 15 s, with up to 20% jitter. */
export const backoffMs = (attempt: number, random = Math.random) => {
	const base = Math.min(15_000, 1_000 * 2 ** (attempt - 1));
	return Math.round(base + base * 0.2 * random());
};

/** Automatic attempts per request before the error reaches the user (who can still press Retry). */
export const MAX_ATTEMPTS = 5;

/** A message a golfer can act on. Server messages are used only where they are written for people. */
/** The 402 message; the UI recognises it to offer the Billing link. */
export const PAYMENT_REQUIRED_MESSAGE = 'Uploading videos needs the Initial Performance Assessment. Pay for it in Billing, then upload again.';

export const errorMessage = (e: unknown, stage: ErrorStage = 'upload'): string => {
	if (e instanceof NetworkError) return 'Your connection dropped. Check it and press Retry; uploaded parts are kept.';
	if (e instanceof MissingEtagError) return "The upload couldn't be confirmed by storage. Please let Trey know; this needs a settings fix.";
	if (e instanceof HttpError) {
		if (e.source === 'storage') {
			if (e.status === 403) return 'The upload link expired. Press Retry to start it again.';
			if (e.status >= 500) return 'Storage is having trouble right now. Press Retry in a moment.';
			return 'Storage refused the upload. Press Retry, or choose the video again.';
		}
		if (e.status === 401) return 'Your session ended. Sign in again, then retry the upload.';
		if (e.status === 402) return PAYMENT_REQUIRED_MESSAGE;
		if (e.status === 403) return "You don't have permission to upload this video.";
		if (e.status === 404) return 'This upload no longer exists. Choose the video again.';
		if (e.status === 409) {
			return stage === 'complete'
				? "We couldn't confirm the video arrived. Press Retry; if it keeps failing, start the upload again."
				: 'This video was already uploaded.';
		}
		if (e.status === 422) return "That file can't be uploaded. Use an MP4, MOV or WebM video up to 500 MB.";
		if (e.status >= 500) return 'Something went wrong on our side. Press Retry in a moment.';
	}
	return stage === 'complete' ? "We couldn't confirm the upload. Press Retry." : 'The upload failed. Press Retry.';
};

// ---------------------------------------------------------------------------------------------
// Multipart plan
// ---------------------------------------------------------------------------------------------

export interface Part {
	readonly partNumber: number;
	readonly start: number;
	readonly end: number;
}

/** Split a file into parts of `partSize` (the server's size); the last part is the remainder. */
export const planParts = (sizeBytes: number, partSize: number): Part[] => {
	if (partSize <= 0) throw new Error('partSize must be positive');
	const parts: Part[] = [];
	for (let start = 0, n = 1; start < sizeBytes; start += partSize, n++) parts.push({ partNumber: n, start, end: Math.min(start + partSize, sizeBytes) });
	return parts;
};

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

export const formatBytes = (n: number) => {
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
	return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

export const formatSpeed = (bps: number | null) => (bps === null || !Number.isFinite(bps) ? '' : `${formatBytes(Math.max(0, Math.round(bps)))}/s`);

/** Whole-second time remaining, or null if the speed is unknown. */
export const etaSeconds = (p: Progress) => (p.speedBps && p.speedBps > 0 ? Math.ceil((p.bytesTotal - p.bytesUploaded) / p.speedBps) : null);

export const formatEta = (s: number | null) => {
	if (s === null) return '';
	if (s < 60) return `${s} s left`;
	return `${Math.ceil(s / 60)} min left`;
};

/** True when a presigned URL's expiry (ISO string) is within `marginMs` of now. Unknown or empty means not expired. */
export const isExpired = (expiresAt: string | undefined, now: number, marginMs = 30_000) => {
	const t = Date.parse(expiresAt ?? '');
	return Number.isFinite(t) && now >= t - marginMs;
};
