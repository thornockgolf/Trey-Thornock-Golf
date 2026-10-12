import { completeSegment } from '../../../../../segment-store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ params }) => completeSegment(params.id, params.segmentId);
