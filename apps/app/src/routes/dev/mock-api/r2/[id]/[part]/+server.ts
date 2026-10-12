import type { RequestHandler } from './$types';
import { put } from '../../../mock-store';

// Dev-only mock of a presigned R2 PUT (part 0 = single upload).
export const PUT: RequestHandler = ({ params, request }) => put(params.id, Number(params.part), request);
