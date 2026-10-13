import { getBilling } from '#lib/server/billing';
import { runLoad } from '#lib/server/runtime';
import type { PageServerLoad } from './$types';

/** The player's payment state from Postgres. Coaches are not billed (403). */
export const load: PageServerLoad = async (event) => ({ billing: await runLoad(event, getBilling), checkout: event.url.searchParams.get('checkout') });
