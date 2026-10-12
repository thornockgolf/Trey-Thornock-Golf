import type { RequestHandler } from './$types';
import { resignUpload } from '../../../mock-store';

export const POST: RequestHandler = ({ params }) => resignUpload(params.id);
