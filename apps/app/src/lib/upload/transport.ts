/**
 * Network edges of the uploader: our JSON API and the presigned storage PUT. Both are behind the
 * `Transport` interface so tests (and the dev preview) can swap them.
 */
import type { CreateVideoResponse, UploadPlan, VideoContentType, VideoDto } from '@ttg/shared';
import { HttpError, MissingEtagError, NetworkError } from './upload-logic';

export interface UploadedPart {
	readonly partNumber: number;
	readonly sizeBytes: number;
	readonly etag: string;
}

export interface PutOptions {
	readonly headers?: Readonly<Record<string, string>>;
	readonly onProgress?: (bytesSent: number) => void;
	readonly signal?: AbortSignal;
}

export interface Transport {
	createVideo(body: { contentType: VideoContentType; sizeBytes: number; title?: string }, signal?: AbortSignal): Promise<CreateVideoResponse>;
	/** A fresh presigned PUT for a pending single-request upload whose URL expired. */
	resignUpload(videoId: string, signal?: AbortSignal): Promise<Extract<UploadPlan, { mode: 'single' }>>;
	signPart(videoId: string, body: { uploadId: string; partNumber: number }, signal?: AbortSignal): Promise<{ url: string }>;
	listParts(videoId: string, uploadId: string, signal?: AbortSignal): Promise<{ parts: readonly UploadedPart[] }>;
	completeMultipart(videoId: string, body: { uploadId: string; parts: readonly { partNumber: number; etag: string }[] }, signal?: AbortSignal): Promise<unknown>;
	abortMultipart(videoId: string, uploadId: string): Promise<unknown>;
	complete(videoId: string, signal?: AbortSignal): Promise<VideoDto>;
	/** PUT bytes to a presigned URL. Resolves with the response ETag (null if not exposed). */
	put(url: string, data: Blob, opts?: PutOptions): Promise<{ etag: string | null }>;
}

const abortError = () => new DOMException('Aborted', 'AbortError');

/** JSON client for `/api/videos/**`. `base` is `/api` in the app and a mock path in dev previews. */
export const createApiTransport = (base = '/api', fetchFn: typeof fetch = (...a) => fetch(...a)): Omit<Transport, 'put'> => {
	const call = async <T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
		let res: Response;
		try {
			res = await fetchFn(`${base}${path}`, {
				method,
				signal,
				headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
				body: body === undefined ? undefined : JSON.stringify(body)
			});
		} catch (e) {
			if (signal?.aborted) throw abortError();
			throw new NetworkError(e instanceof Error ? e.message : undefined);
		}
		const json: unknown = await res.json().catch(() => null);
		if (!res.ok) {
			const err = (json ?? {}) as { code?: string; message?: string };
			throw new HttpError(res.status, err.code ?? null, err.message ?? res.statusText, 'api');
		}
		return json as T;
	};
	const v = (id: string) => `/videos/${encodeURIComponent(id)}`;
	return {
		createVideo: (body, signal) => call('POST', '/videos', body, signal),
		resignUpload: (id, signal) => call('POST', `${v(id)}/upload-url`, undefined, signal),
		signPart: (id, body, signal) => call('POST', `${v(id)}/multipart/sign-part`, body, signal),
		listParts: (id, uploadId, signal) => call('GET', `${v(id)}/multipart/parts?uploadId=${encodeURIComponent(uploadId)}`, undefined, signal),
		completeMultipart: (id, body, signal) => call('POST', `${v(id)}/multipart/complete`, body, signal),
		abortMultipart: (id, uploadId) => call('POST', `${v(id)}/multipart/abort`, { uploadId }),
		complete: (id, signal) => call('POST', `${v(id)}/complete`, undefined, signal)
	};
};

/** Browser PUT with upload progress (fetch has no upload progress), sending exactly the given headers. */
export const xhrPut = (url: string, data: Blob, opts: PutOptions = {}): Promise<{ etag: string | null }> =>
	new Promise((resolve, reject) => {
		if (opts.signal?.aborted) return reject(abortError());
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', url);
		for (const [k, val] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, val);
		xhr.upload.onprogress = (e) => opts.onProgress?.(e.loaded);
		const onAbort = () => xhr.abort();
		opts.signal?.addEventListener('abort', onAbort, { once: true });
		const done = () => opts.signal?.removeEventListener('abort', onAbort);
		xhr.onload = () => {
			done();
			if (xhr.status >= 200 && xhr.status < 300) return resolve({ etag: xhr.getResponseHeader('ETag') });
			reject(new HttpError(xhr.status, null, `Storage responded ${xhr.status}`, 'storage'));
		};
		xhr.onerror = () => {
			done();
			reject(new NetworkError());
		};
		xhr.ontimeout = xhr.onerror;
		xhr.onabort = () => {
			done();
			reject(abortError());
		};
		xhr.send(data);
	});

export const browserTransport = (base = '/api'): Transport => ({ ...createApiTransport(base), put: xhrPut });

/** Read the ETag, failing clearly if CORS hid it (the multipart complete would fail later otherwise). */
export const requireEtag = (etag: string | null) => {
	if (!etag) throw new MissingEtagError();
	return etag;
};
