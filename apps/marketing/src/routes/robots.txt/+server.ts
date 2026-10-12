import { siteConfig } from '@ttg/shared';

export const prerender = true;

export function GET() {
	const body = `User-agent: *\nAllow: /\nDisallow: /offline\n\nSitemap: ${siteConfig.url}/sitemap.xml\n`;
	return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
}
