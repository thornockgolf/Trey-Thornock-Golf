import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { serveMedia } from '../../media';

const cutServed = new Set<string>();

// Dev only. `?token=old` plays the part of an expired signed URL: 403 (the player then asks /playback for a new one).
export const GET: RequestHandler = async ({ params, request, url }) => {
	if (!dev) error(404, 'Not found');
	if (url.searchParams.get('token') === 'old') return new Response('expired', { status: 403 });
	// `token=cut`: starts fine, then the connection drops part-way (what a URL expiring mid-playback looks like)
	if (url.searchParams.get('token') === 'cut' && params.file === 'clip.mp4') {
		// the browser's own retry for the missing bytes finds the URL "expired"
		if (cutServed.has(url.search) && request.headers.get('range') !== 'bytes=0-') return new Response('expired', { status: 403 });
		cutServed.add(url.search);
		const full = serveMedia(params.file, request.headers.get('range'));
		if (full && full.body) {
			const bytes = new Uint8Array(await full.arrayBuffer());
			const stream = new ReadableStream({
				start(c) {
					c.enqueue(bytes.subarray(0, Math.floor(bytes.length * 0.35)));
					setTimeout(() => c.error(new Error('cut')), 300);
				}
			});
			return new Response(stream, { status: full.status, headers: full.headers });
		}
	}
	const res = serveMedia(params.file, request.headers.get('range'), url.searchParams.get('download') ?? undefined);
	return res ?? error(404, 'Not found');
};
