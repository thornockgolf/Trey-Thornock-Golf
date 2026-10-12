import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { VideoDto } from '@ttg/shared';
import { ensureMedia } from '../mock-api/media';
import { REF_ID, SWING2_ID, previewVideo, referenceVideo } from '../mock-api/player-data';
import type { PageServerLoad } from './$types';

// Dev-only preview of Compare and Overlay without a Clerk session or R2:
//   /dev/compare                  a player: own swing (8 s, 60 fps) vs the reference (5 s, 30 fps)
//   /dev/compare?role=coach       a coach: the same, plus "Save for the player" in overlay mode
//   ?mode=overlay                 start in overlay mode;  ?analysis=<id> opens a saved overlay
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	ensureMedia();
	const swing = previewVideo('22222222-2222-4222-8222-222222222222', null);
	const swing2: VideoDto = { ...previewVideo(SWING2_ID, null), title: 'Earlier driver swing' };
	return {
		role: url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const),
		own: [swing, swing2],
		others: [] as VideoDto[],
		references: [referenceVideo(null)],
		analysis: null as null | { id: string; videoId: string; settings: import('@ttg/shared').OverlaySettings },
		REF_ID
	};
};
