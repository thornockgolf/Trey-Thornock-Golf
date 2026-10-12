import { compareData } from '#lib/server/compare';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** Videos the caller can compare, and a saved overlay setup if `?analysis=` names one they may see. */
export const load: PageServerLoad = (event) => runLoad(event, compareData);
