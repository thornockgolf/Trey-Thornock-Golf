import { describe, expect, it } from 'vitest';
import { urlBase64ToBytes } from './client';

describe('urlBase64ToBytes', () => {
	it('decodes a base64url VAPID key, with or without padding', () => {
		// 65 bytes: 0x04 then 64 more, like an uncompressed P-256 point
		const bytes = Uint8Array.from([4, ...Array.from({ length: 64 }, (_, i) => (i * 7 + 250) % 256)]);
		const b64url = Buffer.from(bytes).toString('base64url');
		expect([...urlBase64ToBytes(b64url)]).toEqual([...bytes]);
		expect(urlBase64ToBytes(b64url)).toHaveLength(65);
		expect([...urlBase64ToBytes('_-8')]).toEqual([255, 239]);
	});
});
