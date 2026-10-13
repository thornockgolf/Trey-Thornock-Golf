import { threadPageData } from '#lib/server/chat';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** A conversation's newest messages. 403 for anyone who is not one of its two people. */
export const load: PageServerLoad = (event) => runLoad(event, threadPageData);
