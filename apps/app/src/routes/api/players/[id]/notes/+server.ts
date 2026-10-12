import type { RequestHandler } from './$types';
import { addNote, listNotes } from '#lib/server/players';
import { runRoute } from '#lib/server/runtime';

/** Coach only: private notes on an assigned player. Never returned to players. */
export const GET: RequestHandler = (event) => runRoute(event, listNotes);
export const POST: RequestHandler = (event) => runRoute(event, addNote);
