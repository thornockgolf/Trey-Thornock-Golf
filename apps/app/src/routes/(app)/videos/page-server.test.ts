import { describe, expect, it, vi } from 'vitest';

// The server stack (Clerk, Effect runtime) is not needed to check the redirect.
vi.mock('#lib/server/videos', () => ({ listMyVideos: {} }));
vi.mock('#lib/server/runtime', () => ({ runLoad: async () => ({ videos: [] }) }));

import { load } from './+page.server';

const run = (role: string) => (load as (e: never) => Promise<unknown>)({ parent: async () => ({ user: { role } }), depends: () => {} } as never);

describe('/videos (the list)', () => {
	it('sends a coach to the dashboard', async () => {
		await expect(run('coach')).rejects.toMatchObject({ status: 303, location: '/coach' });
	});
	it('still loads for a player', async () => {
		await expect(run('player')).resolves.toEqual({ videos: [] });
	});
});
