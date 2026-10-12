import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { VideoDto } from '@ttg/shared';
import type { PageServerLoad } from './$types';

// A stand-in poster (a real one is a signed R2 URL to the worker's poster.jpg).
const poster = (a: string, b: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/><circle cx="80" cy="40" r="7" fill="#fff" opacity=".85"/><rect x="77" y="47" width="6" height="26" rx="3" fill="#fff" opacity=".85"/></svg>`)}`;

const base = (id: string, extra: Partial<VideoDto>): VideoDto => ({
	id,
	kind: 'swing',
	status: 'ready',
	title: null,
	errorCode: null,
	durationMs: null,
	fps: null,
	width: null,
	height: null,
	sizeBytes: 50_000_000,
	createdAt: '2026-10-12T15:00:00.000Z',
	posterUrl: null,
	...extra
});

const all: VideoDto[] = [
	base('1', { status: 'uploaded', title: 'Driver, face on', createdAt: '2026-10-12T16:00:00.000Z' }),
	base('2', { status: 'processing', title: 'Wedge, down the line', createdAt: '2026-10-12T15:30:00.000Z' }),
	base('3', { status: 'ready', title: '7 iron, down the line', durationMs: 8_400, posterUrl: poster('#7fb3d5', '#2e7d4f') }),
	base('4', { status: 'ready', title: null, durationMs: 65_000, createdAt: '2026-10-09T15:00:00.000Z' }),
	base('5', { status: 'failed', title: 'A much longer title for a swing video that wraps onto two lines', errorCode: 'transcode_failed', createdAt: '2026-10-08T15:00:00.000Z' }),
	base('6', { status: 'pending', title: 'Hidden: never finished uploading' })
];

// Dev-only preview of the library without a Clerk session: /dev/videos?state=all|empty|live
export const load: PageServerLoad = async ({ url, fetch, depends }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state') ?? 'all';
	const role = url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const);
	if (state === 'live') {
		depends('app:videos');
		const res = await fetch('/dev/mock-api/videos');
		return { state, role, videos: ((await res.json()) as { videos: VideoDto[] }).videos };
	}
	return { state, role, videos: state === 'empty' ? [] : all };
};
