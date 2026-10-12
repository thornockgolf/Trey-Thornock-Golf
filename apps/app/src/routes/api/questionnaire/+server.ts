import type { RequestHandler } from './$types';
import { getQuestionnaire, saveQuestionnaire } from '#lib/server/questionnaire';
import { runRoute } from '#lib/server/runtime';

/** Player: the form, their open draft and their latest completed response. */
export const GET: RequestHandler = (event) => runRoute(event, getQuestionnaire);

/** Player: save a draft, or submit it (`submit: true`). */
export const POST: RequestHandler = (event) => runRoute(event, saveQuestionnaire);
