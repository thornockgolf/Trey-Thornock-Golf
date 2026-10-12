import { undoSegments } from '../../../../segment-store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params }) => undoSegments(params.id);
