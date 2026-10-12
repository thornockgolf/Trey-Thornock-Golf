import { deleteAnnotation, reset, touch, updateAnnotation } from '../../../../annotation-store';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => updateAnnotation(params.id, params.annotationId, await request.json().catch(() => undefined));
export const DELETE: RequestHandler = ({ params, url }) => {
	const v = url.searchParams.get('version');
	return deleteAnnotation(params.id, params.annotationId, v === null ? null : Number(v));
};
// Dev-only test hooks, addressed as /annotations/_touch and /annotations/_reset
export const POST: RequestHandler = ({ params }) => (params.annotationId === '_reset' ? reset(params.id) : touch(params.id));
