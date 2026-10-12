import type { VideoDto } from '@ttg/shared';
import { CLIP_FPS, CLIP_SECONDS, REF_FPS, REF_SECONDS } from './media';

/** The compare preview's reference video (5 s, 30 fps) and a second own swing. */
export const REF_ID = '55555555-5555-4555-8555-555555555555';
export const SWING2_ID = '66666666-6666-4666-8666-666666666666';

export const previewVideo = (id: string, posterUrl: string | null): VideoDto => ({
	id,
	kind: 'swing',
	status: 'ready',
	title: 'Driver, face on',
	errorCode: null,
	durationMs: CLIP_SECONDS * 1000,
	fps: CLIP_FPS,
	width: 1280,
	height: 720,
	sizeBytes: 1_200_000,
	createdAt: '2026-10-12T14:00:00.000Z',
	posterUrl
});

export const referenceVideo = (posterUrl: string | null): VideoDto => ({
	...previewVideo(REF_ID, posterUrl),
	kind: 'reference',
	title: 'Pro driver, face on (placeholder)',
	durationMs: REF_SECONDS * 1000,
	fps: REF_FPS
});
