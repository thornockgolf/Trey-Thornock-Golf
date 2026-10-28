/** TEMPORARY dev tool (docs/system/feedback.md): browser calls for feedback tickets. */
import type { CreateFeedbackRequest, FeedbackDto, FeedbackStatus, FeedbackType, UpdateFeedbackRequest } from '@ttg/shared';
import { ApiError, apiClient } from '#lib/coach/coach-client';

export { ApiError };

/** What the browser knows about where the ticket was filed. Clamped to what the API accepts. */
export const captureContext = (pagePath: string, win: Pick<Window, 'innerWidth' | 'innerHeight'> = window, nav: Pick<Navigator, 'userAgent'> = navigator) => ({
	pagePath: pagePath.slice(0, 1000),
	viewport: `${win.innerWidth}x${win.innerHeight}`.slice(0, 40),
	userAgent: nav.userAgent.slice(0, 1000)
});

export const feedbackApi = (base = '/api') => {
	const api = apiClient(base);
	return {
		list: async (f: { status?: FeedbackStatus; type?: FeedbackType } = {}) => {
			const q = new URLSearchParams();
			if (f.status) q.set('status', f.status);
			if (f.type) q.set('type', f.type);
			const qs = q.toString();
			return (await api.call<{ tickets: FeedbackDto[] }>('GET', `/feedback${qs ? `?${qs}` : ''}`)).tickets;
		},
		create: (b: CreateFeedbackRequest) => api.call<FeedbackDto>('POST', '/feedback', b),
		update: (id: string, b: UpdateFeedbackRequest) => api.call<FeedbackDto>('PATCH', `/feedback/${id}`, b),
		/** The Markdown for a coding agent (coach only). */
		exportMarkdown: async (status: FeedbackStatus | 'all' = 'open') => {
			const res = await fetch(`${base}/feedback/export?status=${status}`, { headers: { accept: 'text/markdown' } });
			if (!res.ok) throw new ApiError(res.status, 'Could not export the tickets');
			return res.text();
		}
	};
};
