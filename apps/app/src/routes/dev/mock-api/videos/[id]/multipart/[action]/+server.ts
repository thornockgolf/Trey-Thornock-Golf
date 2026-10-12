import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { abortMultipart, completeMultipart, guard, listParts, signPart } from '../../../../mock-store';

// Dev-only mock of /api/videos/:id/multipart/{sign-part,parts,complete,abort}.
export const GET: RequestHandler = ({ params }) => {
	guard();
	if (params.action !== 'parts') error(404, 'Not found');
	return listParts(params.id);
};

export const POST: RequestHandler = async ({ params, request }) => {
	guard();
	const body = await request.json();
	if (params.action === 'sign-part') return signPart(params.id, body.partNumber);
	if (params.action === 'complete') return completeMultipart(params.id, body.parts);
	if (params.action === 'abort') return abortMultipart(params.id);
	error(404, 'Not found');
};
