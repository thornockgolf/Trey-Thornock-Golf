/**
 * Dev-only stand-in for `/api/videos/**` and R2, so the upload panel's real code path (Uppy,
 * XHR PUTs, multipart, pause/resume, /complete) can be driven in a browser without Clerk or R2.
 * Every handler 404s outside `vite dev`. State is in memory and lost on restart.
 *
 * Behaviour: files over 2 MB use multipart with 1 MB parts (so a small test file has many parts);
 * each PUT is delayed to make progress visible; a title containing "409" makes the first
 * /complete answer 409; a title containing "flaky" fails every third part PUT with a 500.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import type { CreateVideoResponse, VideoDto } from '@ttg/shared';

interface MockVideo {
	dto: VideoDto;
	contentType: string;
	multipart: { uploadId: string; parts: Map<number, { size: number; etag: string }> } | null;
	object: number | null;
	fail409: boolean;
	flaky: boolean;
	puts: number;
}

const videos = new Map<string, MockVideo>();
export const PART = 1024 * 1024;
const MULTIPART_OVER = 2 * 1024 * 1024;

export const guard = () => {
	if (!dev) error(404, 'Not found');
};

const fail = (status: number, code: string, message: string) => json({ code, message }, { status });

export const create = (body: { contentType: string; sizeBytes: number; title?: string }) => {
	guard();
	if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(body.contentType)) return fail(422, 'ValidationError', 'Expected a video type');
	const id = crypto.randomUUID();
	const dto: VideoDto = {
		id,
		kind: 'swing',
		status: 'pending',
		title: body.title?.trim() || null,
		errorCode: null,
		durationMs: null,
		fps: null,
		width: null,
		height: null,
		sizeBytes: body.sizeBytes,
		createdAt: new Date().toISOString(),
		posterUrl: null
	};
	const multipart = body.sizeBytes > MULTIPART_OVER;
	videos.set(id, {
		dto,
		contentType: body.contentType,
		multipart: multipart ? { uploadId: `mock-${id}`, parts: new Map() } : null,
		object: null,
		fail409: (body.title ?? '').includes('409'),
		flaky: (body.title ?? '').includes('flaky'),
		puts: 0
	});
	const res: CreateVideoResponse = multipart
		? { video: dto, upload: { mode: 'multipart', uploadId: `mock-${id}`, partSizeBytes: PART } }
		: { video: dto, upload: { mode: 'single', url: `/dev/mock-api/r2/${id}/0`, headers: { 'Content-Type': body.contentType }, expiresAt: new Date(Date.now() + 900_000).toISOString() } };
	return json(res);
};

const find = (id: string) => {
	guard();
	return videos.get(id) ?? null;
};

export const signPart = (id: string, partNumber: number) => {
	const v = find(id);
	if (!v?.multipart) return fail(404, 'NotFound', 'Video not found');
	return json({ url: `/dev/mock-api/r2/${id}/${partNumber}`, expiresAt: '' });
};

export const resignUpload = (id: string) => {
	const v = find(id);
	if (!v || v.multipart) return fail(404, 'NotFound', 'Video not found');
	return json({ mode: 'single', url: `/dev/mock-api/r2/${id}/0`, headers: { 'Content-Type': v.contentType }, expiresAt: new Date(Date.now() + 900_000).toISOString() });
};

export const listParts = (id: string) => {
	const v = find(id);
	if (!v?.multipart) return fail(404, 'NotFound', 'Video not found');
	return json({ parts: [...v.multipart.parts].map(([partNumber, p]) => ({ partNumber, sizeBytes: p.size, etag: p.etag })) });
};

export const completeMultipart = (id: string, parts: { partNumber: number; etag: string }[]) => {
	const v = find(id);
	if (!v?.multipart) return fail(404, 'NotFound', 'Video not found');
	for (const p of parts) if (v.multipart.parts.get(p.partNumber)?.etag !== p.etag) return fail(500, 'StorageError', 'Storage operation failed');
	v.object = [...v.multipart.parts.values()].reduce((a, p) => a + p.size, 0);
	return json({ ok: true });
};

export const abortMultipart = (id: string) => {
	const v = find(id);
	if (v?.multipart) v.multipart.parts.clear();
	return json({ ok: true });
};

export const complete = (id: string) => {
	const v = find(id);
	if (!v) return fail(404, 'NotFound', 'Video not found');
	if (v.fail409) {
		v.fail409 = false;
		return fail(409, 'Conflict', 'The upload has not finished. Try again.');
	}
	if (v.object === null) return fail(409, 'Conflict', 'The upload has not finished. Try again.');
	v.dto = { ...v.dto, status: 'uploaded', sizeBytes: v.object };
	// pretend the worker picks it up
	setTimeout(() => (v.dto = { ...v.dto, status: 'processing' }), 4_000);
	setTimeout(() => (v.dto = { ...v.dto, status: 'ready', durationMs: 7_400 }), 12_000);
	return json(v.dto);
};

export const list = () => {
	guard();
	return json({ videos: [...videos.values()].map((v) => v.dto).reverse() });
};

export const put = async (id: string, part: number, request: Request) => {
	const v = find(id);
	if (!v) return new Response('NoSuchUpload', { status: 404 });
	const bytes = (await request.arrayBuffer()).byteLength;
	await new Promise((r) => setTimeout(r, 120 + bytes / 20_000)); // ~50 ms per MB plus latency
	v.puts++;
	if (part === 0) {
		if (request.headers.get('content-type') !== v.contentType) return new Response('SignatureDoesNotMatch', { status: 403 });
		v.object = bytes;
		return new Response(null, { status: 200, headers: { ETag: '"single"' } });
	}
	if (v.flaky && v.puts % 3 === 0) return new Response('InternalError', { status: 500 });
	const etag = `"${id.slice(0, 8)}-${part}-${bytes}"`;
	v.multipart?.parts.set(part, { size: bytes, etag });
	return new Response(null, { status: 200, headers: { ETag: etag, 'Access-Control-Expose-Headers': 'ETag' } });
};
