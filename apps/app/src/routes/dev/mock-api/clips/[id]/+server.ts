import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import { clipFile } from '../../segment-store';
import { serveFile } from '../../media';
import type { RequestHandler } from './$types';

// Dev only: a processed recording, with Range support.
export const GET: RequestHandler = ({ params, request }) => {
	if (!dev) error(404, 'Not found');
	const path = clipFile(params.id);
	return path ? serveFile(path, 'video/mp4', request.headers.get('range')) : error(404, 'Not found');
};
