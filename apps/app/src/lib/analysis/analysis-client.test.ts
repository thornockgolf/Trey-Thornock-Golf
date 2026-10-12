import type { SegmentDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { AnalysisApiError, analysisApi, failureMessage, waitForSegment } from './analysis-client';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fakeFetch = (res: Response | ((url: string, init?: RequestInit) => Response), calls: { url: string; init?: RequestInit }[] = []) =>
	((url: string, init?: RequestInit) => (calls.push({ url, init }), Promise.resolve((typeof res === 'function' ? res(url, init) : res).clone()))) as unknown as typeof fetch;

describe('analysisApi', () => {
	it('uses the documented paths and methods', async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const api = analysisApi('/api', fakeFetch(reply(200, { ok: true }), calls));
		await api.createAnalysis('v1');
		await api.listSegments('a1');
		await api.listSegments('a1', { startMs: 1000, endMs: 4000 });
		await api.createSegment('a1', { startMs: 0, endMs: 1000, contentType: 'audio/webm', sizeBytes: 5 });
		await api.completeSegment('a1', 's1');
		await api.getSegment('a1', 's1');
		await api.undo('a1');
		await api.manifest('a1');
		expect(calls.map((c) => `${c.init?.method ?? 'GET'} ${c.url}`)).toEqual([
			'POST /api/analyses',
			'GET /api/analyses/a1/segments',
			'GET /api/analyses/a1/segments?startMs=1000&endMs=4000',
			'POST /api/analyses/a1/segments',
			'POST /api/analyses/a1/segments/s1/complete',
			'GET /api/analyses/a1/segments/s1',
			'POST /api/analyses/a1/segments/undo',
			'GET /api/analyses/a1/manifest'
		]);
		expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ videoId: 'v1' });
	});

	it('PUTs the recording with exactly the signed headers and nothing else', async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const api = analysisApi('/api', fakeFetch(new Response(null, { status: 200 }), calls));
		const blob = new Blob(['x'], { type: 'audio/webm' });
		await api.uploadRecording({ url: 'https://r2/put', headers: { 'Content-Type': 'audio/webm' }, expiresAt: 'x' }, blob);
		expect(calls[0]).toMatchObject({ url: 'https://r2/put', init: { method: 'PUT', headers: { 'Content-Type': 'audio/webm' } } });
		expect(calls[0]!.init!.body).toBe(blob);
		const bad = analysisApi('/api', fakeFetch(new Response(null, { status: 403 })));
		await expect(bad.uploadRecording({ url: 'u', headers: {}, expiresAt: 'x' }, blob)).rejects.toMatchObject({ status: 403 });
	});

	it('turns an error body into an error with the server message', async () => {
		const api = analysisApi('/api', fakeFetch(reply(409, { code: 'Conflict', message: 'There is nothing to undo' })));
		const err = await api.undo('a1').catch((e) => e);
		expect(err).toBeInstanceOf(AnalysisApiError);
		expect(err.status).toBe(409);
		expect(err.message).toBe('There is nothing to undo');
	});
});

describe('waitForSegment', () => {
	const seg = (status: SegmentDto['status'], errorCode: string | null = null): SegmentDto => ({ id: 's', startMs: 0, endMs: 1, status, errorCode, createdAt: 'x' });
	const noSleep = () => Promise.resolve();

	it('returns when the segment is ready or failed', async () => {
		const seq = [seg('uploaded'), seg('processing'), seg('ready')];
		expect((await waitForSegment(async () => seq.shift()!, { sleep: noSleep })).state).toBe('ready');
		const f = await waitForSegment(async () => seg('failed', 'SEGMENT_TOO_SHORT'), { sleep: noSleep });
		expect(f).toMatchObject({ state: 'failed', segment: { errorCode: 'SEGMENT_TOO_SHORT' } });
	});

	it('survives one or two failed requests but not three in a row', async () => {
		let n = 0;
		const flaky = async () => {
			if (++n <= 2) throw new Error('offline');
			return seg('ready');
		};
		expect((await waitForSegment(flaky, { sleep: noSleep })).state).toBe('ready');
		await expect(waitForSegment(async () => Promise.reject(new Error('down')), { sleep: noSleep })).rejects.toThrow('down');
	});

	it('gives up after the timeout', async () => {
		let t = 0;
		const r = await waitForSegment(async () => seg('processing'), { sleep: async () => void (t += 1000), now: () => t, timeoutMs: 5000 });
		expect(r.state).toBe('timeout');
	});
});

describe('failureMessage', () => {
	it('is plain language and never raw codes', () => {
		for (const code of ['SEGMENT_TOO_SHORT', 'INVALID_RECORDING', 'TRANSCODE_FAILED', null]) expect(failureMessage(code)).not.toMatch(/[A-Z]{4,}_/);
	});
});
