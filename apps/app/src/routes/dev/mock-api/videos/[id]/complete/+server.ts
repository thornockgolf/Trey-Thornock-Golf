import type { RequestHandler } from './$types';
import { complete } from '../../../mock-store';

export const POST: RequestHandler = ({ params }) => complete(params.id);
