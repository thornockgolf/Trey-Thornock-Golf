import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { LoggedSessionDto } from '@ttg/shared';
import { mockLoggedState, seedLogged } from '../mock-api/logged-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the "Log a session" form against an in-memory API (no Clerk, Postgres or R2):
//   /dev/log                 a new log
//   /dev/log?edit=ready      editing a log that has a ready video
//   /dev/log?edit=processing editing a log whose video is still processing
//   /dev/log?edit=none       editing a log without a video (to attach one later)
// Uploads go to the mock video API (/dev/mock-api/videos), the same one /dev/upload uses.
const drills = [
	{ id: '00000000-0000-4000-8000-00000000d001', name: 'Gate drill', category: 'Putting' },
	{ id: '00000000-0000-4000-8000-00000000d002', name: 'Ladder putting', category: 'Putting' },
	{ id: '00000000-0000-4000-8000-00000000d003', name: '9 ball flight', category: 'Full swing' },
	{ id: '00000000-0000-4000-8000-00000000d004', name: 'Landing spot wedges', category: 'Short game' },
	{ id: '00000000-0000-4000-8000-00000000d005', name: 'Up and down game', category: 'Short game' }
];

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	mockLoggedState.drills = drills;
	const edit = url.searchParams.get('edit');
	const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
	const existing: LoggedSessionDto | null = edit
		? {
				id: '00000000-0000-4000-8000-00000000a001',
				playerId: 'p',
				date: day,
				tags: ['skill', 'situational'],
				minutes: 45,
				workedOn: 'Nine holes of short game scoring',
				drills: [{ id: drills[4]!.id, name: drills[4]!.name }],
				notes: 'Chipped well, three-putted twice.',
				video: edit === 'none' ? null : { id: '00000000-0000-4000-8000-00000000b001', status: edit === 'ready' ? 'ready' : 'processing', title: null },
				createdAt: '2026-11-01T18:00:00Z'
		  }
		: null;
	if (existing) seedLogged(existing);
	return { drills, existing };
};
