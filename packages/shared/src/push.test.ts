import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from './push';

describe('isAllowedPushEndpoint', () => {
	it('accepts the browsers\' push services over https', () => {
		for (const u of [
			'https://fcm.googleapis.com/fcm/send/abc',
			'https://updates.push.services.mozilla.com/wpush/v2/abc',
			'https://web.push.apple.com/QWxs',
			'https://wns2-par02p.notify.windows.com/w/?token=x'
		])
			expect(isAllowedPushEndpoint(u), u).toBe(true);
	});

	it('refuses anything else, so the server never posts to an address a client chose', () => {
		for (const u of [
			'http://fcm.googleapis.com/fcm/send/abc',
			'https://evil.example.com/fcm.googleapis.com',
			'https://fcm.googleapis.com.evil.example.com/x',
			'https://notfcm.googleapis.com.evil.io/',
			'https://xfcm.googleapis.com/x',
			'https://user:pw@fcm.googleapis.com/x',
			'https://fcm.googleapis.com:8443/x',
			'https://127.0.0.1/x',
			'https://169.254.169.254/latest/meta-data',
			'not a url',
			''
		])
			expect(isAllowedPushEndpoint(u), u).toBe(false);
	});
});
