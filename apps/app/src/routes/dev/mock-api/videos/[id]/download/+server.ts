import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const variant = url.searchParams.get('variant') ?? 'processed';
	const filename = variant === 'original' ? 'Driver-original.mov' : 'Driver.mp4';
	return json({ url: `/dev/mock-api/media/clip.mp4?token=new&download=${encodeURIComponent(filename)}`, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), filename });
};
