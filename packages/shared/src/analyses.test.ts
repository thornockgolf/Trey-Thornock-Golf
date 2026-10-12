import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { CreateAnalysisRequest, DEFAULT_OVERLAY, OverlaySettings, readOverlay } from './analyses';

const ID = '00000000-0000-4000-8000-000000000001';

describe('OverlaySettings', () => {
	const ok = { ...DEFAULT_OVERLAY, overlayVideoId: ID, opacity: 0.4, scale: 1.2, x: 0.1, y: -0.2, baseSyncMs: 1200, overlaySyncMs: 900 };
	it('accepts valid settings', () => {
		expect(Schema.decodeUnknownSync(OverlaySettings)(ok)).toEqual(ok);
	});
	it.each([
		['opacity 0', { opacity: 0 }],
		['opacity over 1', { opacity: 1.5 }],
		['scale tiny', { scale: 0.1 }],
		['scale huge', { scale: 10 }],
		['x out of frame', { x: 0.9 }],
		['fractional sync', { baseSyncMs: 1.5 }],
		['negative sync', { overlaySyncMs: -1 }],
		['not a uuid', { overlayVideoId: '../etc/passwd' }],
		['NaN', { scale: NaN }]
	])('rejects %s', (_n, patch) => {
		expect(() => Schema.decodeUnknownSync(OverlaySettings)({ ...ok, ...patch })).toThrow();
	});
	it('strips unknown properties', () => {
		expect((Schema.decodeUnknownSync(OverlaySettings)({ ...ok, evil: 1 }) as any).evil).toBeUndefined();
	});
});

describe('readOverlay', () => {
	it('gives defaults for the empty column value and for garbage', () => {
		expect(readOverlay({})).toEqual(DEFAULT_OVERLAY);
		expect(readOverlay(null)).toEqual(DEFAULT_OVERLAY);
		expect(readOverlay({ opacity: 99 })).toEqual(DEFAULT_OVERLAY);
	});
	it('fills missing fields from the defaults', () => {
		expect(readOverlay({ overlayVideoId: ID, scale: 2 })).toEqual({ ...DEFAULT_OVERLAY, overlayVideoId: ID, scale: 2 });
	});
});

describe('CreateAnalysisRequest', () => {
	it('needs a uuid video id', () => {
		expect(Schema.decodeUnknownSync(CreateAnalysisRequest)({ videoId: ID })).toEqual({ videoId: ID });
		expect(() => Schema.decodeUnknownSync(CreateAnalysisRequest)({ videoId: 'x' })).toThrow();
	});
});
