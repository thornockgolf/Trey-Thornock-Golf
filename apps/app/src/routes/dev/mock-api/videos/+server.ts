import type { RequestHandler } from './$types';
import { create, list } from '../mock-store';

// Dev-only mock of /api/videos (see mock-store.ts).
export const GET: RequestHandler = () => list();
export const POST: RequestHandler = async ({ request }) => create(await request.json());
