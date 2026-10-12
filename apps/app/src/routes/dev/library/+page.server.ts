import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { VideoDto } from '@ttg/shared';
import type { PageServerLoad } from './$types';

const poster = (a: string, b: string) =>
	`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/><circle cx="80" cy="40" r="7" fill="#fff" opacity=".85"/><rect x="77" y="47" width="6" height="26" rx="3" fill="#fff" opacity=".85"/></svg>`)}`;

const ref = (id: string, extra: Partial<VideoDto>): VideoDto => ({
	id,
	kind: 'reference',
	status: 'ready',
	title: null,
	errorCode: null,
	durationMs: 7_800,
	fps: 60,
	width: 1280,
	height: 720,
	sizeBytes: 30_000_000,
	createdAt: '2026-10-10T15:00:00.000Z',
	posterUrl: null,
	...extra
});

// Dev-only preview of the coach's reference library without a Clerk session: /dev/library?state=all|empty
// The uploader talks to the mock API, so the real upload code and the title rule can be driven.
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state') ?? 'all';
	const videos: VideoDto[] =
		state === 'empty'
			? []
			: [
					ref('r1', { title: 'Pro driver, face on (placeholder)', posterUrl: poster('#7fb3d5', '#2e7d4f') }),
					ref('r2', { title: 'Pro 7 iron, down the line (placeholder)', posterUrl: poster('#e8c37a', '#2e7d4f'), createdAt: '2026-10-09T15:00:00.000Z' }),
					ref('r3', { title: 'Wedge, still processing', status: 'processing', durationMs: null, createdAt: '2026-10-12T16:00:00.000Z' })
				];
	return { videos, state };
};
