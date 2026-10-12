/**
 * Drives one Uppy instance for a single video upload and keeps an `UploadState` (see
 * `upload-logic.ts`). Plain TypeScript so it runs in Vitest; `upload-store.svelte.ts` mirrors the
 * state into runes for the UI.
 */
import Uppy from '@uppy/core';
import { MAX_VIDEO_BYTES, VIDEO_TYPES, type VideoDto } from '@ttg/shared';
import type { Transport } from './transport';
import {
	MAX_ATTEMPTS,
	SpeedMeter,
	backoffMs,
	canRetry,
	errorMessage,
	idle,
	isAbortError,
	isBusy,
	isTransient,
	percentOf,
	transition,
	validateFile,
	type UploadEvent,
	type UploadState
} from './upload-logic';
import VideoUploader, { defaultSleep, type VideoBody, type VideoMeta, type VideoUploaderOptions } from './video-uploader';

export interface ControllerOptions extends Omit<VideoUploaderOptions, 'id'> {
	now?: () => number;
	initialState?: UploadState;
	/** What the upload becomes. Defaults to a player swing; a coach's reference clip sends `reference`. */
	kind?: 'swing' | 'reference';
}

export class UploadController {
	state: UploadState;
	title = '';
	readonly uppy: Uppy<VideoMeta, VideoBody>;
	#plugin: VideoUploader;
	#listeners = new Set<(s: UploadState) => void>();
	#speed = new SpeedMeter();
	#fileId: string | null = null;
	#file: File | null = null;
	#online = true;
	#completing: AbortController | null = null;

	constructor(private readonly opts: ControllerOptions) {
		this.state = opts.initialState ?? idle;
		this.uppy = new Uppy<VideoMeta, VideoBody>({
			autoProceed: false,
			allowMultipleUploadBatches: true,
			// the same limits as our own check; ours runs first so the message is readable
			restrictions: {
				maxNumberOfFiles: 1,
				maxFileSize: MAX_VIDEO_BYTES,
				allowedFileTypes: [...Object.keys(VIDEO_TYPES), ...Object.values(VIDEO_TYPES).map((e) => `.${e}`)]
			}
		});
		this.#plugin = this.uppy.use(VideoUploader, { ...opts, id: 'VideoUploader' }).getPlugin('VideoUploader') as VideoUploader;

		this.uppy.on('upload-progress', (file, p) => {
			if (!file || file.id !== this.#fileId || p.bytesTotal == null) return;
			const now = (this.opts.now ?? Date.now)();
			const speedBps = this.state.kind === 'uploading' ? this.#speed.sample(p.bytesUploaded, now) : null;
			this.#dispatch({ type: 'progress', progress: { bytesUploaded: p.bytesUploaded, bytesTotal: p.bytesTotal, percent: percentOf(p.bytesUploaded, p.bytesTotal), speedBps } });
		});
		this.uppy.on('upload-success', (file) => {
			if (file?.id !== this.#fileId) return;
			this.#dispatch({ type: 'bytes-done' });
			void this.#finalize();
		});
		this.uppy.on('upload-error', (file, error) => {
			if (file?.id !== this.#fileId) return;
			this.#dispatch({ type: 'failed', stage: 'upload', message: errorMessage(error, 'upload') });
		});
	}

	subscribe(fn: (s: UploadState) => void) {
		this.#listeners.add(fn);
		fn(this.state);
		return () => this.#listeners.delete(fn);
	}

	#dispatch(e: UploadEvent) {
		const next = transition(this.state, e);
		if (next === this.state) return;
		this.state = next;
		for (const fn of this.#listeners) fn(next);
	}

	/** The server's id for the current upload, once `POST /api/videos` answered. */
	get videoId(): string | undefined {
		return this.#fileId ? (this.#plugin.videoIdOf(this.#fileId) ?? this.uppy.getFile(this.#fileId)?.meta.videoId) : undefined;
	}

	get online() {
		return this.#online;
	}

	/** Choose a file. Rejected files never reach Uppy or the server. Ignored while an upload is in flight. */
	pick(file: File) {
		if (isBusy(this.state)) return;
		this.#clearUppy();
		const v = validateFile(file);
		if (!v.ok) return this.#dispatch({ type: 'rejected', message: v.message });
		try {
			this.#fileId = this.uppy.addFile({ name: file.name, type: v.file.contentType, data: file, meta: { contentType: v.file.contentType } });
		} catch (e) {
			// Uppy restriction (should not happen after our check, but never crash the panel)
			return this.#dispatch({ type: 'rejected', message: e instanceof Error ? e.message : 'That file cannot be uploaded.' });
		}
		this.#file = file;
		this.#dispatch({ type: 'reset' });
		this.#dispatch({ type: 'picked', file: v.file });
	}

	start() {
		if (this.state.kind !== 'selected' || !this.#fileId || !this.#online) return;
		const title = this.title.trim().slice(0, 120);
		this.uppy.setFileMeta(this.#fileId, { ...(title ? { title } : {}), ...(this.opts.kind ? { kind: this.opts.kind } : {}) });
		this.#speed.reset();
		this.#dispatch({ type: 'start' });
		this.uppy.upload().catch((e: unknown) => this.#dispatch({ type: 'failed', stage: 'upload', message: errorMessage(e) }));
	}

	pause(reason: 'user' | 'offline' = 'user') {
		if (!this.#fileId) return;
		if (this.state.kind === 'uploading') {
			const file = this.uppy.getFile(this.#fileId);
			if (file && !file.isPaused) this.uppy.pauseResume(this.#fileId);
		}
		this.#speed.reset();
		this.#dispatch({ type: 'pause', reason });
	}

	resume() {
		if (this.state.kind !== 'paused' || !this.#fileId || !this.#online) return;
		const file = this.uppy.getFile(this.#fileId);
		this.#speed.reset();
		this.#dispatch({ type: 'resume' });
		if (file?.isPaused) this.uppy.pauseResume(this.#fileId);
	}

	/** Re-send the bytes (resuming multipart from the parts storage has), or re-confirm with `/complete`. */
	retry() {
		const s = this.state;
		if (!canRetry(s) || !this.#fileId || !this.#online || s.kind !== 'error') return;
		this.#dispatch({ type: 'retry' });
		if (s.stage === 'complete') return void this.#finalize();
		this.#speed.reset();
		this.uppy.retryUpload(this.#fileId).catch((e: unknown) => this.#dispatch({ type: 'failed', stage: 'upload', message: errorMessage(e) }));
	}

	/** Start the same file again as a new video (after a confirmation error that Retry can't fix). */
	startOver() {
		const file = this.#file;
		if (!file || isBusy(this.state)) return;
		this.pick(file);
		this.start();
	}

	/** Stop and forget the upload. Multipart uploads are aborted in storage. */
	cancel() {
		this.#completing?.abort();
		this.#clearUppy();
		this.#file = null;
		this.#dispatch({ type: 'reset' });
	}

	/** Feed the browser's network status. Offline pauses a running upload; reconnecting resumes it unless the user paused. */
	setOnline(online: boolean) {
		if (this.#online === online) return;
		this.#online = online;
		if (!online && this.state.kind === 'uploading') this.pause('offline');
		else if (online && this.state.kind === 'paused' && this.state.reason === 'offline') this.resume();
	}

	destroy() {
		this.#completing?.abort();
		this.#listeners.clear();
		this.#clearUppy();
		this.uppy.destroy();
	}

	#clearUppy() {
		// cancelAll removes the files; the plugin aborts any multipart upload in storage
		if (this.uppy.getFiles().length) this.uppy.cancelAll();
		this.#fileId = null;
	}

	/** `POST /api/videos/:id/complete`. Success is shown only after it returns. 409 means storage has no object yet. */
	async #finalize() {
		const id = this.videoId;
		if (!id) return this.#dispatch({ type: 'failed', stage: 'complete', message: errorMessage(null, 'complete') });
		this.#completing?.abort();
		const ctrl = new AbortController();
		this.#completing = ctrl;
		const sleep = this.opts.sleep ?? defaultSleep;
		try {
			let video: VideoDto | undefined;
			for (let attempt = 1; !video; attempt++) {
				try {
					video = await this.opts.transport.complete(id, ctrl.signal);
				} catch (e) {
					if (ctrl.signal.aborted || !isTransient(e) || attempt >= MAX_ATTEMPTS) throw e;
					await sleep(backoffMs(attempt, this.opts.random), ctrl.signal);
				}
			}
			if (ctrl.signal.aborted) return;
			this.#dispatch({ type: 'completed', video });
		} catch (e) {
			if (ctrl.signal.aborted || isAbortError(e)) return;
			this.#dispatch({ type: 'failed', stage: 'complete', message: errorMessage(e, 'complete') });
		}
	}
}
