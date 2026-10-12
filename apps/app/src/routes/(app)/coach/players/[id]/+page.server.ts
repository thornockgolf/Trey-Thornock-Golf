import { playerDetailData } from '#lib/server/players';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Under `/coach`. An assigned player's questionnaire, videos, plan progress and the coach's private notes. */
export const load: PageServerLoad = (event) => runLoad(event, playerDetailData);
