import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PlaybackResponse } from '@ttg/shared';
import { ensureMedia } from '../mock-api/media';
import { previewVideo } from '../mock-api/player-data';
import type { PageServerLoad } from './$types';

// Dev-only preview of annotations without a Clerk session or R2:
//   /dev/annotations              a coach: draw, undo/redo, save, edit, delete
//   /dev/annotations?role=player  a player: the same drawings, read-only
//   /dev/annotations?vertical=1   a portrait video (letterboxed): drawings must stay on the picture
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	ensureMedia();
	const id = url.searchParams.has('vertical') ? '44444444-4444-4444-8444-444444444444' : '33333333-3333-4333-8333-333333333333';
	const base = '/dev/mock-api/media';
	const video = { ...previewVideo(id, `${base}/poster.jpg?token=new`), ...(url.searchParams.has('vertical') ? { width: 720, height: 1280 } : {}) };
	const playback: PlaybackResponse = {
		video,
		url: `${base}/clip.mp4?token=new`,
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		spriteUrl: `${base}/sprite.jpg?token=new`,
		spriteVttUrl: `${base}/sprite.vtt?token=new`
	};
	return { video, playback, canAnnotate: url.searchParams.get('role') !== 'player' };
};
