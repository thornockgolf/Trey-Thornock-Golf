import type { RequestEvent } from '@sveltejs/kit';
import { Context } from 'effect';

/** The SvelteKit request being handled. Provided per request by `runRoute`. */
export class RequestContext extends Context.Service<RequestContext, { readonly event: RequestEvent }>()(
	'ttg/app/RequestContext'
) {}
