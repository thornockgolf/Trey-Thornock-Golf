import { calendarPageData } from '#lib/server/calendar';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The player's calendar and their own videos (for linking one in a check-in). */
export const load: PageServerLoad = (event) => runLoad(event, calendarPageData);
