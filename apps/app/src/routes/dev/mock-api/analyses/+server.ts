import { createAnalysis } from '../analysis-store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => createAnalysis(await request.json().catch(() => undefined));
