import { getSegment } from '../../../../segment-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => getSegment(params.id, params.segmentId);
