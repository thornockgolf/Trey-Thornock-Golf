import { manifest } from '../../../segment-store';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => manifest(params.id);
