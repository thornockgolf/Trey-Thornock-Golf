import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PlaybackResponse, VideoDto } from '@ttg/shared';
import { ensureMedia } from '../mock-api/media';
import { previewVideo } from '../mock-api/player-data';
import type { PageServerLoad } from './$types';

// Dev-only preview of the video page without a Clerk session or R2:
//   /dev/player            ready video, working URLs
//   /dev/player?stale=1    the first video URL is "expired" (403), so the player must fetch a new one
//   /dev/player?cut=1      the connection drops part-way through playback; the player must fetch a new URL and resume
//   /dev/player?state=processing|failed   the non-ready pages
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	ensureMedia();
	const id = '22222222-2222-4222-8222-222222222222';
	const base = '/dev/mock-api/media';
	const token = url.searchParams.has('cut') ? 'cut' : url.searchParams.has('stale') ? 'old' : 'new';
	const state = url.searchParams.get('state');
	if (state === 'processing' || state === 'failed') {
		const video: VideoDto = { ...previewVideo(id, null), status: state, durationMs: null, fps: null, width: null, height: null, errorCode: state === 'failed' ? 'TRANSCODE_FAILED' : null };
		return { video, playback: null as PlaybackResponse | null };
	}
	const playback: PlaybackResponse = {
		video: previewVideo(id, `${base}/poster.jpg?token=new`),
		url: `${base}/clip.mp4?token=${token}`,
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		spriteUrl: `${base}/sprite.jpg?token=new`,
		spriteVttUrl: `${base}/sprite.vtt?token=new`
	};
	return { video: playback.video, playback };
};
