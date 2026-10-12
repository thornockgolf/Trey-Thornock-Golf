import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import type { PlaybackResponse } from '@ttg/shared';
import type { RequestHandler } from './$types';
import { previewVideo } from '../../../player-data';

/** Dev only: a fresh "signed" playback URL (the `token=new` one is accepted by the media route). */
export const GET: RequestHandler = ({ params, url }) => {
	if (!dev) error(404, 'Not found');
	const base = `/dev/mock-api/media`;
	const fresh = `token=new&n=${Date.now()}`;
	const body: PlaybackResponse = {
		video: previewVideo(params.id, `${base}/poster.jpg?${fresh}`),
		url: `${base}/clip.mp4?${fresh}`,
		expiresAt: new Date(Date.now() + (url.searchParams.has('short') ? 20_000 : 3_600_000)).toISOString(),
		spriteUrl: `${base}/sprite.jpg?${fresh}`,
		spriteVttUrl: `${base}/sprite.vtt?${fresh}`
	};
	return json(body);
};
