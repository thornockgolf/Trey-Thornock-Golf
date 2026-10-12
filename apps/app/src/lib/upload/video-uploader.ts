/**
 * Uppy uploader plugin for our video API.
 *
 * Why not `@uppy/aws-s3`: v6 (the current major) was rewritten around `signRequest`, where Uppy
 * itself sends every S3 request (create, list, complete, abort) to presigned URLs and parses the
 * XML. Our server does create/list/complete/abort itself and only presigns the byte PUTs, and the
 * callback options that matched this (`getUploadParameters`, `createMultipartUpload`, `signPart`,
 * `listParts`, ...) were removed in 6.0. This plugin keeps Uppy's core (files, restrictions,
 * pause/resume/retry, progress events) and talks to `/api/videos/**` directly.
 *
 * Flow per file: `POST /api/videos` (the server picks single or multipart and fixes the key from
 * the video id, kept in the file meta as `videoId`) -> PUT the bytes (single) or sign and PUT each
 * part, re-listing parts on every resume -> multipart complete. The caller then calls
 * `POST /api/videos/:id/complete`; this plugin never declares the video uploaded.
 */
import { BasePlugin, EventManager, type DefinePluginOpts, type PluginOpts, type Uppy } from '@uppy/core';
import type { UploadPlan, VideoContentType } from '@ttg/shared';
import type { Transport } from './transport';
import { requireEtag } from './transport';
import { MAX_ATTEMPTS, backoffMs, isAbortError, isExpired, isTransient, planParts } from './upload-logic';

/** Uppy file meta. All optional because Uppy merges partial updates (`setFileMeta`). */
export type VideoMeta = { contentType?: VideoContentType; title?: string; videoId?: string; kind?: 'swing' | 'reference' };
export type VideoBody = Record<string, never>;

export interface VideoUploaderOptions extends PluginOpts {
	transport: Transport;
	isOnline?: () => boolean;
	/** Resolves when the browser is back online (or rejects on abort). */
	waitForOnline?: (signal: AbortSignal) => Promise<void>;
	sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	random?: () => number;
}

type Opts = DefinePluginOpts<VideoUploaderOptions, 'isOnline' | 'waitForOnline' | 'sleep' | 'random'>;

interface Job {
	videoId?: string;
	plan?: UploadPlan;
	etags: Map<number, string>;
	/** Bytes of the part (or single PUT) in flight. */
	inFlight: Map<number, number>;
	/** A previous attempt ran, so the multipart parts must be re-listed before continuing. */
	attempted: boolean;
	/** Multipart complete was sent at least once with no clear answer (lost response). */
	completeSent: boolean;
	controller?: AbortController;
	settle?: () => void;
	events: EventManager<VideoMeta, VideoBody>;
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export const defaultSleep = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal.aborted) return reject(abortError());
		const t = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(t);
			reject(abortError());
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});

const defaultWaitForOnline = (signal: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal.aborted) return reject(abortError());
		if (typeof navigator === 'undefined' || navigator.onLine) return resolve();
		const on = () => {
			signal.removeEventListener('abort', off);
			resolve();
		};
		const off = () => {
			removeEventListener('online', on);
			reject(abortError());
		};
		addEventListener('online', on, { once: true });
		signal.addEventListener('abort', off, { once: true });
	});

export default class VideoUploader extends BasePlugin<Opts, VideoMeta, VideoBody> {
	#jobs = new Map<string, Job>();

	constructor(uppy: Uppy<VideoMeta, VideoBody>, opts: VideoUploaderOptions) {
		super(uppy, {
			isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
			waitForOnline: defaultWaitForOnline,
			sleep: defaultSleep,
			random: Math.random,
			...opts
		});
		this.id = opts.id ?? 'VideoUploader';
		this.type = 'uploader';
	}

	override install() {
		const { capabilities } = this.uppy.getState();
		this.uppy.setState({ capabilities: { ...capabilities, resumableUploads: true } });
		this.uppy.addUploader(this.#upload);
	}

	override uninstall() {
		this.uppy.removeUploader(this.#upload);
		for (const id of [...this.#jobs.keys()]) this.#cancel(id);
	}

	/** The video id the server gave this file, once created. */
	videoIdOf(fileId: string) {
		return this.#jobs.get(fileId)?.videoId;
	}

	#upload = async (fileIDs: string[]) => {
		const files = this.uppy.getFilesByIds(fileIDs);
		this.uppy.emit('upload-start', files.filter((f) => !f.progress.uploadStarted));
		await Promise.all(files.map((f) => this.#run(f.id)));
	};

	#job(fileId: string): Job {
		let job = this.#jobs.get(fileId);
		if (!job) {
			const events = new EventManager(this.uppy);
			job = { etags: new Map(), inFlight: new Map(), attempted: false, completeSent: false, events };
			events.onFilePause(fileId, (paused) => (paused ? job!.controller?.abort() : this.#attempt(fileId)));
			events.onFileRemove(fileId, () => this.#cancel(fileId));
			events.onCancelAll(fileId, () => this.#cancel(fileId));
			this.#jobs.set(fileId, job);
		}
		return job;
	}

	/** Resolves when the file succeeds, fails (after automatic retries) or is cancelled; stays pending while paused. */
	#run(fileId: string) {
		const job = this.#job(fileId);
		return new Promise<void>((resolve) => {
			job.settle = resolve;
			this.#attempt(fileId);
		});
	}

	#attempt(fileId: string) {
		const job = this.#jobs.get(fileId);
		const file = this.uppy.getFile(fileId);
		if (!job || !file) return;
		job.controller?.abort();
		const controller = new AbortController();
		job.controller = controller;
		this.#send(fileId, job, controller.signal).then(
			() => {
				if (controller.signal.aborted) return;
				job.events.remove();
				this.uppy.emit('upload-success', this.uppy.getFile(fileId), { status: 200, body: {} as VideoBody, uploadURL: undefined });
				this.#jobs.delete(fileId);
				job.settle?.();
			},
			(e: unknown) => {
				// pause and cancel abort on purpose: pause waits for resume, cancel settles itself
				if (controller.signal.aborted || isAbortError(e)) return;
				const err = e instanceof Error ? e : new Error(String(e));
				this.uppy.emit('upload-error', this.uppy.getFile(fileId), err);
				job.settle?.();
			}
		);
	}

	#cancel(fileId: string) {
		const job = this.#jobs.get(fileId);
		if (!job) return;
		job.controller?.abort();
		job.events.remove();
		this.#jobs.delete(fileId);
		// free the stored parts; the pending video row stays (there is no delete endpoint yet)
		if (job.videoId && job.plan?.mode === 'multipart') {
			this.opts.transport.abortMultipart(job.videoId, job.plan.uploadId).catch((e: unknown) => this.uppy.log(`Abort multipart failed: ${String(e)}`, 'warning'));
		}
		job.settle?.();
	}

	/** Retry transient failures with backoff; while offline, wait for the connection without spending attempts. */
	async #retry<T>(op: () => Promise<T>, signal: AbortSignal): Promise<T> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await op();
			} catch (e) {
				if (signal.aborted || isAbortError(e)) throw abortError();
				if (!isTransient(e) || attempt >= MAX_ATTEMPTS) throw e;
				if (!this.opts.isOnline()) {
					attempt--;
					await this.opts.waitForOnline(signal);
				} else {
					await this.opts.sleep(backoffMs(attempt, this.opts.random), signal);
				}
			}
		}
	}

	#progress(fileId: string, job: Job, total: number, parts?: ReturnType<typeof planParts>) {
		let done = 0;
		if (parts) for (const p of parts) if (job.etags.has(p.partNumber)) done += p.end - p.start;
		for (const b of job.inFlight.values()) done += b;
		const file = this.uppy.getFile(fileId);
		if (!file) return;
		this.uppy.emit('upload-progress', file, { uploadStarted: file.progress.uploadStarted ?? Date.now(), bytesUploaded: Math.min(done, total), bytesTotal: total });
	}

	async #send(fileId: string, job: Job, signal: AbortSignal) {
		const t = this.opts.transport;
		const file = this.uppy.getFile(fileId);
		const data = file.data as Blob;
		const total = data.size;
		const resumed = job.attempted;
		job.attempted = true;
		job.inFlight.clear();

		if (!job.videoId || !job.plan) {
			const title = file.meta.title?.trim();
			const res = await this.#retry(() => t.createVideo({ contentType: file.meta.contentType ?? (file.type as VideoContentType), sizeBytes: total, ...(title ? { title } : {}), ...(file.meta.kind ? { kind: file.meta.kind } : {}) }, signal), signal);
			job.videoId = res.video.id;
			job.plan = res.upload;
			this.uppy.setFileMeta(fileId, { videoId: res.video.id });
		}
		const videoId = job.videoId;
		const plan = job.plan;

		if (plan.mode === 'single') {
			// a resumed single PUT starts over: storage has no partial object for it
			await this.#retry(async () => {
				job.inFlight.set(0, 0);
				this.#progress(fileId, job, total);
				// the URL lasts 15 min: after a long pause or slow retries, ask for a fresh one for the same video
				let current = job.plan as typeof plan;
				if (isExpired(current.expiresAt, Date.now())) job.plan = current = await t.resignUpload(videoId, signal);
				await t.put(current.url, data, {
					headers: current.headers,
					signal,
					onProgress: (b) => {
						job.inFlight.set(0, b);
						this.#progress(fileId, job, total);
					}
				});
				job.inFlight.set(0, total);
			}, signal);
			this.#progress(fileId, job, total);
			return;
		}

		const parts = planParts(total, plan.partSizeBytes);
		if (resumed && !job.completeSent) {
			// trust storage, not memory: keep only parts it has, with the size we expect
			const { parts: have } = await this.#retry(() => t.listParts(videoId, plan.uploadId, signal), signal);
			job.etags.clear();
			for (const p of have) {
				const want = parts[p.partNumber - 1];
				if (want && p.etag && p.sizeBytes === want.end - want.start) job.etags.set(p.partNumber, p.etag);
			}
		}
		this.#progress(fileId, job, total, parts);

		for (const part of parts) {
			if (job.etags.has(part.partNumber)) continue;
			signal.throwIfAborted();
			const etag = await this.#retry(async () => {
				job.inFlight.set(part.partNumber, 0);
				const { url } = await t.signPart(videoId, { uploadId: plan.uploadId, partNumber: part.partNumber }, signal);
				const res = await t.put(url, data.slice(part.start, part.end), {
					signal,
					onProgress: (b) => {
						job.inFlight.set(part.partNumber, b);
						this.#progress(fileId, job, total, parts);
					}
				});
				return requireEtag(res.etag);
			}, signal).finally(() => job.inFlight.delete(part.partNumber));
			job.etags.set(part.partNumber, etag);
			this.#progress(fileId, job, total, parts);
		}

		const body = { uploadId: plan.uploadId, parts: parts.map((p) => ({ partNumber: p.partNumber, etag: job.etags.get(p.partNumber)! })) };
		try {
			await this.#retry(async () => {
				try {
					return await t.completeMultipart(videoId, body, signal);
				} catch (e) {
					if (isTransient(e)) job.completeSent = true;
					throw e;
				}
			}, signal);
		} catch (e) {
			// A lost response may hide a complete that worked (the upload id is then gone, so every
			// retry fails). `/complete` HEADs the object and is the real judge, so hand over to it.
			if (!job.completeSent || isAbortError(e)) throw e;
		}
	}
}
