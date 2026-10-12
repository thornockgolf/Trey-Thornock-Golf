import type { VideoDto } from '@ttg/shared';
import { CLIP_FPS, CLIP_SECONDS } from './media';

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
