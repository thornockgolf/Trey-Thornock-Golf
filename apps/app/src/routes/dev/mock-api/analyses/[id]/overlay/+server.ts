import { getOverlay, putOverlay } from '../../../analysis-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => getOverlay(params.id);
export const PUT: RequestHandler = async ({ params, request }) => putOverlay(params.id, await request.json().catch(() => undefined));
