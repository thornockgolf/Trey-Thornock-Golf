import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Dev-only preview of the full-page error screens without a session:
// /dev/access?kind=role | closed | missing | broken
export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const kind = url.searchParams.get('kind');
	if (kind === 'closed') error(403, 'This account has been closed');
	if (kind === 'missing') error(404, 'Not found');
	if (kind === 'broken') error(500, 'boom');
	error(403, 'Not allowed');
};
