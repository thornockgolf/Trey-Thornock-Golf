import type { AnalysisDto, CreateSegmentRequest, CreateSegmentResponse, ExportDto, ManifestResponse, SegmentDto } from '@ttg/shared';

type Fetch = typeof fetch;

/** A failed call. `status` 409 on `complete` means the file is not in storage yet; on `undo`, nothing to undo. */
export class AnalysisApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

const jsonHeaders = { 'content-type': 'application/json', accept: 'application/json' };

const parse = async <T>(res: Response): Promise<T> => {
	if (res.ok) return (await res.json()) as T;
	let message = 'Something went wrong';
	try {
		message = ((await res.json()) as { message?: string }).message ?? message;
	} catch {
		// not JSON
	}
	throw new AnalysisApiError(res.status, message);
};

export interface SegmentsListing {
	segments: SegmentDto[];
	/** Annotations that start inside the asked range (null when no range was asked). */
	annotationsInRange: number | null;
}

/** Thin client for the analysis recording endpoints. `base` is `/api` (or the dev mock). */
export const analysisApi = (base: string, f: Fetch = (...a) => fetch(...a)) => ({
	createAnalysis: async (videoId: string) =>
		parse<AnalysisDto>(await f(`${base}/analyses`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ videoId }) })),

	listSegments: async (analysisId: string, range?: { startMs: number; endMs: number }) =>
		parse<SegmentsListing>(
			await f(`${base}/analyses/${analysisId}/segments${range ? `?startMs=${range.startMs}&endMs=${range.endMs}` : ''}`, { headers: jsonHeaders })
		),

	createSegment: async (analysisId: string, body: CreateSegmentRequest) =>
		parse<CreateSegmentResponse>(await f(`${base}/analyses/${analysisId}/segments`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) })),

	/** PUT the recording to the presigned URL, with exactly the headers it was signed for. */
	uploadRecording: async (upload: CreateSegmentResponse['upload'], blob: Blob) => {
		const res = await f(upload.url, { method: 'PUT', headers: upload.headers, body: blob });
		if (!res.ok) throw new AnalysisApiError(res.status, 'The upload did not go through');
	},

	completeSegment: async (analysisId: string, segmentId: string) =>
		parse<SegmentDto>(await f(`${base}/analyses/${analysisId}/segments/${segmentId}/complete`, { method: 'POST', headers: jsonHeaders })),

	getSegment: async (analysisId: string, segmentId: string) =>
		parse<SegmentDto>(await f(`${base}/analyses/${analysisId}/segments/${segmentId}`, { headers: jsonHeaders })),

	undo: async (analysisId: string) =>
		parse<{ restored: number; restoredAnnotations: number }>(await f(`${base}/analyses/${analysisId}/segments/undo`, { method: 'POST', headers: jsonHeaders })),

	/** Ask for the flattened export (the answer is its state; poll `getExport`). */
	requestExport: async (analysisId: string) =>
		parse<ExportDto>(await f(`${base}/analyses/${analysisId}/export`, { method: 'POST', headers: jsonHeaders })),

	getExport: async (analysisId: string) => parse<ExportDto>(await f(`${base}/analyses/${analysisId}/export`, { headers: jsonHeaders })),

	manifest: async (analysisId: string) => parse<ManifestResponse>(await f(`${base}/analyses/${analysisId}/manifest`, { headers: jsonHeaders }))
});

export interface PollOptions {
	/** Delay between checks. */
	everyMs?: number;
	/** Give up after this long and report `timeout`. */
	timeoutMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	signal?: AbortSignal;
}

/**
 * Wait for the worker: poll a segment until it is `ready` or `failed`. A single failed request does not end the wait
 * (a flaky connection should not look like a failed recording); three in a row do.
 */
export const waitForSegment = async (
	get: () => Promise<SegmentDto>,
	{ everyMs = 1500, timeoutMs = 5 * 60_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, signal }: PollOptions = {}
): Promise<{ state: 'ready' | 'failed' | 'timeout'; segment?: SegmentDto }> => {
	const t0 = now();
	let errors = 0;
	while (now() - t0 < timeoutMs) {
		if (signal?.aborted) return { state: 'timeout' };
		try {
			const seg = await get();
			errors = 0;
			if (seg.status === 'ready') return { state: 'ready', segment: seg };
			if (seg.status === 'failed') return { state: 'failed', segment: seg };
		} catch (e) {
			if (++errors >= 3) throw e;
		}
		await sleep(everyMs);
	}
	return { state: 'timeout' };
};

/** What the coach reads when a recording could not be processed (the old recording is always kept). */
export const failureMessage = (errorCode: string | null) => {
	switch (errorCode) {
		case 'SEGMENT_TOO_SHORT':
			return 'That recording was much shorter than the part of the video it was for. Try again.';
		case 'INVALID_RECORDING':
			return 'The recording could not be read. Try again.';
		default:
			return 'The recording could not be processed. Try again.';
	}
};
