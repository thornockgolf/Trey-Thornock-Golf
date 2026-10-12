import { describe, expect, it } from 'vitest';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { PRESIGN_GET_TTL_S, PRESIGN_PUT_TTL_S } from '@ttg/shared';
import { attachment, R2 } from './r2';
import { makeFakeR2 } from './r2-fake';

// Presigning is computed locally, so the live layer is testable without any network or real keys.
const live = R2.layerFromConfig({
	endpoint: 'https://acct123.r2.cloudflarestorage.com',
	accessKeyId: 'AKIAFAKEFAKEFAKEFAKE',
	secretAccessKey: 'fake-secret-fake-secret-fake-secret-0000',
	bucket: 'my-bucket'
});
const rt = ManagedRuntime.make(live);
const run = <A, E>(f: (r2: R2['Service']) => Effect.Effect<A, E>) => rt.runPromise(R2.use(f));
const KEY = 'raw/123e4567-e89b-42d3-a456-426614174000/source.mp4';

describe('R2 presigning (live layer, offline)', () => {
	it('presigns a PUT with a 15 minute expiry, path-style, signing content type and length', async () => {
		const p = await run((r) => r.presignPut({ key: KEY, contentType: 'video/mp4', sizeBytes: 1234 }));
		const u = new URL(p.url);
		expect(u.host).toBe('acct123.r2.cloudflarestorage.com');
		expect(u.pathname).toBe(`/my-bucket/${KEY}`);
		expect(u.searchParams.get('X-Amz-Expires')).toBe(String(PRESIGN_PUT_TTL_S));
		const signed = u.searchParams.get('X-Amz-SignedHeaders') ?? '';
		expect(signed).toContain('content-type');
		expect(signed).toContain('content-length');
		expect(p.method).toBe('PUT');
		expect(p.headers).toEqual({ 'Content-Type': 'video/mp4' });
		expect(p.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
		expect(p.expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60_000);
	});

	it('does not add the SDK default checksum params that break browser uploads', async () => {
		const p = await run((r) => r.presignPut({ key: KEY, contentType: 'video/mp4', sizeBytes: 10 }));
		const q = new URL(p.url).search.toLowerCase();
		expect(q).not.toContain('checksum');
		expect(q).not.toContain('x-amz-sdk-checksum');
	});

	it('changing the signed length yields a different signature', async () => {
		const a = await run((r) => r.presignPut({ key: KEY, contentType: 'video/mp4', sizeBytes: 100 }));
		const b = await run((r) => r.presignPut({ key: KEY, contentType: 'video/mp4', sizeBytes: 101 }));
		expect(new URL(a.url).searchParams.get('X-Amz-Signature')).not.toBe(new URL(b.url).searchParams.get('X-Amz-Signature'));
	});

	it('presigns a part with uploadId and partNumber', async () => {
		const p = await run((r) => r.presignPart({ key: KEY, uploadId: 'abc', partNumber: 3 }));
		const u = new URL(p.url);
		expect(u.searchParams.get('uploadId')).toBe('abc');
		expect(u.searchParams.get('partNumber')).toBe('3');
		expect(u.searchParams.get('X-Amz-Expires')).toBe(String(PRESIGN_PUT_TTL_S));
	});

	it('presigns a GET for one hour by default and honors a shorter expiry', async () => {
		const a = await run((r) => r.presignGet({ key: KEY }));
		expect(new URL(a.url).searchParams.get('X-Amz-Expires')).toBe(String(PRESIGN_GET_TTL_S));
		const b = await run((r) => r.presignGet({ key: KEY, expiresInSeconds: 60 }));
		expect(new URL(b.url).searchParams.get('X-Amz-Expires')).toBe('60');
	});

	it('forces a download with a safe filename', async () => {
		const p = await run((r) => r.presignGet({ key: KEY, downloadName: 'my swing "1"\r\nX: y.mp4' }));
		const disp = new URL(p.url).searchParams.get('response-content-disposition') ?? '';
		expect(disp.startsWith('attachment; filename="')).toBe(true);
		expect(disp).not.toMatch(/[\r\n]/);
		expect(disp.slice('attachment; filename="'.length, -1)).not.toContain('"');
	});
});

describe('attachment()', () => {
	it('replaces unsafe characters and never returns an empty name', () => {
		expect(attachment('a/b\\c".mp4')).toBe('attachment; filename="a_b_c_.mp4"');
		expect(attachment('')).toBe('attachment; filename="download"');
		expect(attachment('x'.repeat(500)).length).toBeLessThan(160);
	});
});

describe('fake R2 (for handler tests)', () => {
	it('head reports a seeded object and undefined for a missing key', async () => {
		const fake = makeFakeR2();
		fake.objects.set(KEY, { sizeBytes: 5, contentType: 'video/mp4' });
		const r = ManagedRuntime.make(fake.layer);
		expect(await r.runPromise(R2.use((x) => x.head(KEY)))).toEqual({ sizeBytes: 5, contentType: 'video/mp4' });
		expect(await r.runPromise(R2.use((x) => x.head('nope')))).toBeUndefined();
	});

	it('runs a multipart upload end to end and rejects a wrong etag', async () => {
		const fake = makeFakeR2();
		const r = ManagedRuntime.make(fake.layer);
		const { uploadId } = await r.runPromise(R2.use((x) => x.createMultipart({ key: KEY, contentType: 'video/mp4' })));
		const e1 = fake.uploadPart(uploadId, 1, 10);
		const e2 = fake.uploadPart(uploadId, 2, 4);
		const listed = await r.runPromise(R2.use((x) => x.listParts({ key: KEY, uploadId })));
		expect(listed.map((p) => p.partNumber)).toEqual([1, 2]);
		await expect(
			r.runPromise(R2.use((x) => x.completeMultipart({ key: KEY, uploadId, parts: [{ partNumber: 1, etag: 'bad' }] })))
		).rejects.toBeDefined();
		await r.runPromise(R2.use((x) => x.completeMultipart({ key: KEY, uploadId, parts: [{ partNumber: 1, etag: e1 }, { partNumber: 2, etag: e2 }] })));
		expect(fake.objects.get(KEY)?.sizeBytes).toBe(14);
	});
});
