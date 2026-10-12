import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PlaybackResponse } from '@ttg/shared';
import { ensureMedia } from '../mock-api/media';
import { previewVideo } from '../mock-api/player-data';
import type { PageServerLoad } from './$types';

// Dev-only preview of the analysis recorder without a Clerk session, R2 or the worker: the browser's real
// MediaRecorder output is uploaded to an in-memory mock, processed with ffmpeg, and played back from the manifest.
//   /dev/analyze                   the coach recorder
//   /dev/analyze?analysis=<id>     reopen an analysis made earlier in this dev session
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	ensureMedia();
	const id = '77777777-7777-4777-8777-777777777777';
	const base = '/dev/mock-api/media';
	const playback: PlaybackResponse = {
		video: previewVideo(id, `${base}/poster.jpg?token=new`),
		url: `${base}/clip.mp4?token=new`,
		expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
		spriteUrl: `${base}/sprite.jpg?token=new`,
		spriteVttUrl: `${base}/sprite.vtt?token=new`
	};
	return { video: playback.video, playback, analysisId: url.searchParams.get('analysis') };
};
