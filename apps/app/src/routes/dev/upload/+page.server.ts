import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const STATES = ['idle', 'offline', 'selected', 'uploading', 'paused', 'paused-offline', 'finalizing', 'error', 'complete-error', 'invalid', 'success', 'live'] as const;
export type PreviewState = (typeof STATES)[number];

// Dev-only preview of the upload panel without a Clerk session: /dev/upload?state=uploading&role=coach
// `state=live` runs the real store against the dev mock API (/dev/mock-api).
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state') as PreviewState | null;
	return {
		state: state && STATES.includes(state) ? state : ('idle' as PreviewState),
		states: STATES,
		role: url.searchParams.get('role') === 'coach' ? ('coach' as const) : ('player' as const)
	};
};
