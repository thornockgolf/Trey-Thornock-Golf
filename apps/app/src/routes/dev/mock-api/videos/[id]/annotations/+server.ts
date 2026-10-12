import { listAnnotations, createAnnotation } from '../../../annotation-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => listAnnotations(params.id);
export const POST: RequestHandler = async ({ params, request }) => createAnnotation(params.id, await request.json().catch(() => undefined));
