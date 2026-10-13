import type { RequestHandler } from './$types';

const MAX_BYTES = 8 * 1024;
const pick = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : undefined);

/**
 * Browsers POST Content-Security-Policy violations here while the policy is report-only (`csp.ts`). We
 * log a trimmed line to stdout (Coolify) so the policy can be fixed before it is enforced. Public and
 * unauthenticated by nature, so the body is capped and never stored.
 */
export const POST: RequestHandler = async ({ request }) => {
	const text = (await request.text().catch(() => '')).slice(0, MAX_BYTES);
	try {
		const parsed = JSON.parse(text) as Record<string, Record<string, unknown>>;
		const r = parsed['csp-report'] ?? parsed;
		console.warn(
			'csp violation',
			JSON.stringify({
				directive: pick(r['violated-directive'] ?? r['effectiveDirective']),
				blocked: pick(r['blocked-uri'] ?? r['blockedURL']),
				page: pick(r['document-uri'] ?? r['documentURL'])
			})
		);
	} catch {
		// not JSON: ignore
	}
	return new Response(null, { status: 204 });
};
