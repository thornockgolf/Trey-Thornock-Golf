import type { AnnotationDto, AnnotationShape } from '@ttg/shared';

type Fetch = typeof fetch;

/** A failed annotation call. `status` 409 means the row changed under you: reload and try again. */
export class AnnotationApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
	get isConflict() {
		return this.status === 409;
	}
}

const json = { 'content-type': 'application/json', accept: 'application/json' };

const parse = async <T>(res: Response): Promise<T> => {
	if (res.ok) return (await res.json()) as T;
	let message = 'Something went wrong';
	try {
		message = ((await res.json()) as { message?: string }).message ?? message;
	} catch {
		// non-JSON error body
	}
	throw new AnnotationApiError(res.status, message);
};

/** Thin client for `/api/videos/:id/annotations`. `base` is `/api` (or the dev mock). */
export const annotationApi = (base: string, videoId: string, f: Fetch = fetch) => {
	const root = `${base}/videos/${videoId}/annotations`;
	return {
		list: async () => (await parse<{ annotations: AnnotationDto[] }>(await f(root, { headers: json }))).annotations,
		create: async (input: { startMs: number; endMs: number; shape: AnnotationShape }) =>
			parse<AnnotationDto>(await f(root, { method: 'POST', headers: json, body: JSON.stringify(input) })),
		update: async (id: string, input: { version: number; startMs?: number; endMs?: number; shape?: AnnotationShape }) =>
			parse<AnnotationDto>(await f(`${root}/${id}`, { method: 'PATCH', headers: json, body: JSON.stringify(input) })),
		remove: async (id: string, version: number) => {
			await parse<{ ok: true }>(await f(`${root}/${id}?version=${version}`, { method: 'DELETE', headers: json }));
		}
	};
};
