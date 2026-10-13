import { siteConfig } from '@ttg/shared';

export const prerender = true;

// /offline is intentionally excluded (utility page, not for search).
const paths = ['/', '/golf-lessons-durham', '/privacy', '/terms'];

export function GET() {
	const urls = paths.map((p) => `  <url><loc>${siteConfig.url}${p}</loc></url>`).join('\n');
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
