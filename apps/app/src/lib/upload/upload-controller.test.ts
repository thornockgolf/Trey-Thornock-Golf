import { afterEach, describe, expect, it } from 'vitest';
import type { CreateVideoResponse, VideoDto } from '@ttg/shared';
import type { PutOptions, Transport, UploadedPart } from './transport';
import { UploadController } from './upload-controller';
import { HttpError, NetworkError } from './upload-logic';

const abortError = () => new DOMException('Aborted', 'AbortError');

/** In-memory stand-in for `/api/videos/**` plus R2, with failure injection and gates to hold a PUT open. */
class FakeServer implements Transport {
	mode: 'single' | 'multipart' = 'single';
	partSize = 4;
	calls: string[] = [];
	stored = new Map<string, Blob>();
	parts = new Map<number, { etag: string; size: number }>();
	putHeaders: Record<string, string>[] = [];
	completedParts: { partNumber: number; etag: string }[] | null = null;
	/** Fail the next N PUTs with a network error. */
	failPuts = 0;
	/** Next /complete responses to return before succeeding. */
	completeErrors: Error[] = [];
	/** When set, PUTs for this part number wait until `release()`. */
	holdPart: number | null = null;
	#release: (() => void) | null = null;
	completeGate: Promise<void> | null = null;
	/** `expiresAt` of the first single-PUT URL (empty = unknown). */
	firstUrlExpiresAt = '';
	aborted = false;
	id = '11111111-1111-4111-8111-111111111111';

	release() {
		this.holdPart = null;
		this.#release?.();
	}

	async createVideo(body: { sizeBytes: number; title?: string }): Promise<CreateVideoResponse> {
		this.calls.push(`create:${body.title ?? ''}`);
		const video = { id: this.id, status: 'pending' } as VideoDto;
		return this.mode === 'single'
			? { video, upload: { mode: 'single', url: `r2://${this.id}/single`, headers: { 'Content-Type': 'video/mp4' }, expiresAt: this.firstUrlExpiresAt } }
			: { video, upload: { mode: 'multipart', uploadId: 'up-1', partSizeBytes: this.partSize } };
	}
	async resignUpload() {
		this.calls.push('resign');
		return { mode: 'single' as const, url: `r2://${this.id}/single2`, headers: { 'Content-Type': 'video/mp4' }, expiresAt: new Date(Date.now() + 900_000).toISOString() };
	}
	async signPart(_id: string, b: { partNumber: number }) {
		this.calls.push(`sign:${b.partNumber}`);
		return { url: `r2://${this.id}/part/${b.partNumber}` };
	}
	async listParts(): Promise<{ parts: UploadedPart[] }> {
		this.calls.push('list');
		return { parts: [...this.parts].map(([partNumber, p]) => ({ partNumber, sizeBytes: p.size, etag: p.etag })) };
	}
	async completeMultipart(_id: string, body: { parts: readonly { partNumber: number; etag: string }[] }) {
		this.calls.push('mp-complete');
		this.completedParts = [...body.parts];
		return { ok: true };
	}
	async abortMultipart() {
		this.calls.push('abort');
		this.aborted = true;
		return { ok: true };
	}
	async complete(id: string): Promise<VideoDto> {
		this.calls.push('complete');
		if (this.completeGate) await this.completeGate;
		const err = this.completeErrors.shift();
		if (err) throw err;
		return { id, status: 'uploaded' } as VideoDto;
	}
	async put(url: string, data: Blob, opts: PutOptions = {}) {
		const part = url.includes('/part/') ? Number(url.split('/').pop()) : 0;
		this.calls.push(`put:${part}`);
		this.putHeaders.push({ ...opts.headers });
		if (this.failPuts > 0) {
			this.failPuts--;
			throw new NetworkError();
		}
		opts.onProgress?.(Math.floor(data.size / 2));
		if (this.holdPart === part) {
			await new Promise<void>((resolve, reject) => {
				this.#release = resolve;
				opts.signal?.addEventListener('abort', () => reject(abortError()), { once: true });
			});
		}
		if (opts.signal?.aborted) throw abortError();
		opts.onProgress?.(data.size);
		if (part) this.parts.set(part, { etag: `"etag-${part}"`, size: data.size });
		else this.stored.set(url, data);
		return { etag: part ? `"etag-${part}"` : '"single"' };
	}
}

const until = async (pred: () => boolean, label = 'condition') => {
	for (let i = 0; i < 400; i++) {
		if (pred()) return;
		await new Promise((r) => setTimeout(r, 2));
	}
	throw new Error(`Timed out waiting for ${label}`);
};

const mp4 = (bytes = 10, name = 'swing.mp4') => new File([new Uint8Array(bytes)], name, { type: 'video/mp4' });

let controllers: UploadController[] = [];
const make = (server: FakeServer, online = { value: true }) => {
	const c = new UploadController({
		transport: server,
		sleep: async () => {},
		random: () => 0,
		isOnline: () => online.value,
		waitForOnline: () => until(() => online.value, 'online')
	});
	controllers.push(c);
	return c;
};

afterEach(() => {
	for (const c of controllers) c.destroy();
	controllers = [];
});

describe('UploadController', () => {
	it('uploads a small file with one PUT, sends the signed headers, then confirms with /complete', async () => {
		const server = new FakeServer();
		const c = make(server);
		const seen: string[] = [];
		c.subscribe((s) => seen.at(-1) !== s.kind && seen.push(s.kind));
		c.title = '  Driver, face on ';
		c.pick(mp4());
		c.start();
		await until(() => c.state.kind === 'success', 'success');
		expect(server.calls).toEqual(['create:Driver, face on', 'put:0', 'complete']);
		expect(server.putHeaders[0]).toEqual({ 'Content-Type': 'video/mp4' });
		expect(seen).toEqual(['idle', 'selected', 'uploading', 'finalizing', 'success']);
		expect(c.state).toMatchObject({ kind: 'success', video: { id: server.id } });
	});

	it('asks for a fresh URL for the same video when the single-PUT URL has expired', async () => {
		const server = new FakeServer();
		server.firstUrlExpiresAt = new Date(Date.now() - 60_000).toISOString();
		const c = make(server);
		c.pick(mp4());
		c.start();
		await until(() => c.state.kind === 'success', 'success');
		expect(server.calls).toEqual(['create:', 'resign', 'put:0', 'complete']);
	});

	it('never shows success while /complete is still pending', async () => {
		const server = new FakeServer();
		let open!: () => void;
		server.completeGate = new Promise((r) => (open = r));
		const c = make(server);
		c.pick(mp4());
		c.start();
		await until(() => server.calls.includes('complete'));
		expect(c.state.kind).toBe('finalizing');
		open();
		await until(() => c.state.kind === 'success');
	});

	it('uploads multipart in the server part size and completes with ordered ETags', async () => {
		const server = new FakeServer();
		server.mode = 'multipart';
		const c = make(server);
		c.pick(mp4(10));
		c.start();
		await until(() => c.state.kind === 'success');
		expect(server.calls).toEqual(['create:', 'sign:1', 'put:1', 'sign:2', 'put:2', 'sign:3', 'put:3', 'mp-complete', 'complete']);
		expect(server.completedParts).toEqual([
			{ partNumber: 1, etag: '"etag-1"' },
			{ partNumber: 2, etag: '"etag-2"' },
			{ partNumber: 3, etag: '"etag-3"' }
		]);
	});

	it('retries a dropped part automatically (re-signing it)', async () => {
		const server = new FakeServer();
		server.mode = 'multipart';
		server.failPuts = 2;
		const c = make(server);
		c.pick(mp4(8));
		c.start();
		await until(() => c.state.kind === 'success');
		expect(server.calls.filter((x) => x === 'sign:1')).toHaveLength(3);
	});

	it('pauses and resumes multipart from the parts storage already has', async () => {
		const server = new FakeServer();
		server.mode = 'multipart';
		server.holdPart = 2;
		const c = make(server);
		c.pick(mp4(10));
		c.start();
		await until(() => server.calls.includes('put:2'));
		expect(c.state).toMatchObject({ kind: 'uploading', progress: { bytesUploaded: 6 } });
		c.pause();
		expect(c.state).toMatchObject({ kind: 'paused', reason: 'user' });
		server.holdPart = null;
		c.resume();
		await until(() => c.state.kind === 'success');
		expect(server.calls).toEqual(['create:', 'sign:1', 'put:1', 'sign:2', 'put:2', 'list', 'sign:2', 'put:2', 'sign:3', 'put:3', 'mp-complete', 'complete']);
	});

	it('pauses when the connection drops and resumes when it returns', async () => {
		const server = new FakeServer();
		server.mode = 'multipart';
		server.holdPart = 1;
		const online = { value: true };
		const c = make(server, online);
		c.pick(mp4(8));
		c.start();
		await until(() => server.calls.includes('put:1'));
		online.value = false;
		c.setOnline(false);
		expect(c.state).toMatchObject({ kind: 'paused', reason: 'offline' });
		server.holdPart = null;
		online.value = true;
		c.setOnline(true);
		await until(() => c.state.kind === 'success');
		expect(server.calls).toContain('list');
	});

	it('stays paused after reconnecting if the user paused', async () => {
		const server = new FakeServer();
		server.holdPart = 0;
		const c = make(server);
		c.pick(mp4());
		c.start();
		await until(() => server.calls.includes('put:0'));
		c.setOnline(false);
		c.pause();
		c.setOnline(true);
		expect(c.state).toMatchObject({ kind: 'paused', reason: 'user' });
	});

	it('offers Retry on a 409 from /complete and re-confirms without re-uploading', async () => {
		const server = new FakeServer();
		server.completeErrors = [new HttpError(409, 'Conflict', 'The upload has not finished. Try again.')];
		const c = make(server);
		c.pick(mp4());
		c.start();
		await until(() => c.state.kind === 'error');
		expect(c.state).toMatchObject({ kind: 'error', stage: 'complete', message: expect.stringContaining("couldn't confirm") });
		c.retry();
		await until(() => c.state.kind === 'success');
		expect(server.calls.filter((x) => x.startsWith('put'))).toHaveLength(1);
		expect(server.calls.filter((x) => x === 'complete')).toHaveLength(2);
	});

	it('retries /complete automatically on a server error', async () => {
		const server = new FakeServer();
		server.completeErrors = [new HttpError(500, 'InternalError', 'Something went wrong')];
		const c = make(server);
		c.pick(mp4());
		c.start();
		await until(() => c.state.kind === 'success');
	});

	it('surfaces an upload error after the automatic attempts, then Retry resumes', async () => {
		const s2 = new FakeServer();
		s2.mode = 'multipart';
		const c2 = make(s2);
		c2.pick(mp4(8));
		s2.holdPart = 2;
		c2.start();
		await until(() => s2.calls.includes('put:2'));
		// part 2 then fails on every automatic attempt
		s2.failPuts = 99;
		s2.holdPart = null;
		c2.pause();
		c2.resume();
		await until(() => c2.state.kind === 'error');
		expect(c2.state).toMatchObject({ kind: 'error', stage: 'upload', message: expect.stringContaining('connection') });
		s2.failPuts = 0;
		c2.retry();
		await until(() => c2.state.kind === 'success');
		expect(s2.calls.filter((x) => x === 'put:1')).toHaveLength(1);
	});

	it('cancel aborts a multipart upload in storage and returns to idle', async () => {
		const server = new FakeServer();
		server.mode = 'multipart';
		server.holdPart = 1;
		const c = make(server);
		c.pick(mp4(8));
		c.start();
		await until(() => server.calls.includes('put:1'));
		c.cancel();
		expect(c.state.kind).toBe('idle');
		await until(() => server.aborted, 'abort');
	});

	it('rejects an unsupported file before any request', () => {
		const server = new FakeServer();
		const c = make(server);
		c.pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
		expect(c.state).toMatchObject({ kind: 'error', stage: 'validation' });
		c.start();
		expect(server.calls).toEqual([]);
	});

	it('does not start while offline', () => {
		const server = new FakeServer();
		const c = make(server);
		c.setOnline(false);
		c.pick(mp4());
		c.start();
		expect(c.state.kind).toBe('selected');
		expect(server.calls).toEqual([]);
	});
});
