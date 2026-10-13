/**
 * Dev-only in-memory stand-in for chat, notifications and billing, so those screens can be driven without Clerk, Postgres,
 * Realtime or Stripe. It follows the real rules where they matter to the screens (402 without a membership, 4000 characters,
 * a seq cursor, de-duplication is the client's job). Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import {
	MAX_MESSAGE_LENGTH,
	SendMessageRequest,
	entitlementsFor,
	type BillingDto,
	type ConversationDto,
	type MessageDto,
	type NotificationDto
} from '@ttg/shared';
import { Schema } from 'effect';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => json({ code, message, ...extra }, { status });
const nowIso = () => new Date().toISOString();

export const COACH = '00000000-0000-4000-8000-00000000c0ac';
export const PLAYER = '00000000-0000-4000-8000-00000000b001';
export const CONVERSATION = '00000000-0000-4000-8000-00000000c001';
export const VIDEO = '00000000-0000-4000-8000-000000000a01';

let seq = 0;
const messages: MessageDto[] = [];
const add = (senderId: string, body: string, over: Partial<MessageDto> = {}) => {
	const m: MessageDto = { id: crypto.randomUUID(), seq: ++seq, conversationId: CONVERSATION, senderId, body, videoId: null, videoMs: null, createdAt: nowIso(), ...over };
	messages.push(m);
	return m;
};
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
add(COACH, 'Welcome, Sam. Send me a down-the-line video of your 7 iron and we will start there.', { createdAt: ago(60 * 26) });
add(PLAYER, 'Will do. I tend to hit it fat when I get quick from the top.', { createdAt: ago(60 * 25) });
add(COACH, 'At 3.2 s your hips are already sliding. Watch this moment.', { videoId: VIDEO, videoMs: 3200, createdAt: ago(60 * 2) });

const state = {
	/** Who the preview is: `player` or `coach`. */
	readCursor: { [PLAYER]: 1, [COACH]: 0 } as Record<string, number>,
	paid: true,
	assessment: false,
	membership: true,
	pastDue: false,
	notifications: [
		{ id: 'n1', type: 'plan_assigned', payload: { planTitle: 'Short game, week 1' }, readAt: null, createdAt: ago(90) },
		{ id: 'n2', type: 'video_ready', payload: { videoId: VIDEO, title: 'Driver, down the line' }, readAt: ago(30), createdAt: ago(60 * 5) }
	] as Mutable<NotificationDto>[]
};

const unreadFor = (me: string) => messages.filter((m) => m.senderId !== me && m.seq > (state.readCursor[me] ?? 0)).length;
const meOf = (url: URL) => (url.searchParams.get('as') === 'coach' ? COACH : PLAYER);

const conversationFor = (me: string): ConversationDto => ({
	id: CONVERSATION,
	other: me === PLAYER ? { id: COACH, displayName: 'Trey Thornock', email: null, role: 'coach' } : { id: PLAYER, displayName: 'Sam Rivera', email: null, role: 'player' },
	lastMessage: messages.at(-1) ?? null,
	unread: unreadFor(me),
	updatedAt: messages.at(-1)?.createdAt ?? nowIso()
});

const billing = (): BillingDto => {
	const ent = entitlementsFor({
		assessmentPaid: state.assessment || state.membership,
		subscription: state.membership
			? { status: state.pastDue ? 'past_due' : 'active', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000), pastDueSince: state.pastDue ? new Date(Date.now() - 2 * 86_400_000) : null, cancelAtPeriodEnd: false }
			: null,
		now: new Date()
	});
	return {
		assessmentPaid: state.assessment || state.membership,
		subscription: state.membership ? { status: state.pastDue ? 'past_due' : 'active', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(), cancelAtPeriodEnd: false } : null,
		entitlements: { assessment: ent.assessment, membership: ent.membership, pastDue: ent.pastDue, graceEndsAt: ent.graceEndsAt?.toISOString() ?? null, endsAt: ent.endsAt?.toISOString() ?? null },
		payments: [
			...(state.assessment || state.membership ? [{ id: 'p1', kind: 'assessment', amountCents: 14900, currency: 'usd', status: 'paid', paidAt: ago(60 * 24 * 20) }] : []),
			...(state.membership ? [{ id: 'p2', kind: 'membership', amountCents: 4900, currency: 'usd', status: 'paid', paidAt: ago(60 * 24 * 10) }] : [])
		],
		canManage: state.membership || state.assessment
	};
};

/** Preview controls: `/__set` changes what the mock says (billing stage), `/__peer` makes the other person send a message. */
export const commsHandle = (method: string, path: string, body: unknown, url: URL): Response | undefined => {
	if (!dev) error(404, 'Not found');
	const seg = path.split('/').filter(Boolean);
	const me = meOf(url);

	if (seg[0] === '__set' && method === 'POST') {
		Object.assign(state, body as object);
		return json({ ok: true });
	}
	if (seg[0] === '__peer' && method === 'POST') {
		const from = me === PLAYER ? COACH : PLAYER;
		const m = add(from, String((body as { body?: string })?.body ?? 'New message from the other side'));
		state.notifications.unshift({ id: crypto.randomUUID(), type: 'message', payload: { conversationId: CONVERSATION, senderName: 'Trey Thornock', count: 1, preview: m.body }, readAt: null, createdAt: m.createdAt });
		return json(m);
	}

	if (seg[0] === 'unread' && method === 'GET') return json({ messages: unreadFor(me), notifications: state.notifications.filter((n) => !n.readAt).length });
	if (seg[0] === 'notifications') {
		if (method === 'GET') return json({ notifications: state.notifications, unread: state.notifications.filter((n) => !n.readAt).length });
		if (method === 'PATCH') {
			const b = body as { ids?: string[]; all?: boolean };
			let updated = 0;
			for (const n of state.notifications) if (!n.readAt && (b.all || b.ids?.includes(n.id))) ((n.readAt = nowIso()), updated++);
			return json({ updated, unread: state.notifications.filter((n) => !n.readAt).length });
		}
	}
	if (seg[0] === 'realtime' && seg[1] === 'token') return json({ enabled: false });

	if (seg[0] === 'conversations') {
		if (seg.length === 1 && method === 'GET') return json({ conversations: [conversationFor(me)] });
		if (seg[1] !== CONVERSATION) return fail(404, 'NotFound', 'Conversation not found');
		if (seg[2] === 'read' && method === 'POST') {
			state.readCursor[me] = seq;
			for (const n of state.notifications) if (n.type === 'message') n.readAt ??= nowIso();
			return json({ unread: { messages: 0, notifications: state.notifications.filter((n) => !n.readAt).length } });
		}
		if (seg[2] === 'messages' && method === 'GET') {
			const after = url.searchParams.get('after');
			const before = url.searchParams.get('before');
			let list = messages.filter((m) => (after ? m.seq > Number(after) : true) && (before ? m.seq < Number(before) : true));
			if (!after && !before) list = list.slice(-50);
			return json({ conversation: conversationFor(me), messages: list, hasMore: false });
		}
		if (seg[2] === 'messages' && method === 'POST') {
			let b: typeof SendMessageRequest.Type;
			try {
				b = Schema.decodeUnknownSync(SendMessageRequest)(body);
			} catch {
				return fail(422, 'ValidationError', 'Invalid request: check body');
			}
			if (!state.membership && me === PLAYER) return fail(402, 'PaymentError', 'An active coaching membership is needed for this', { billingUrl: '/billing' });
			const text = b.body.trim();
			if (!text || text.length > MAX_MESSAGE_LENGTH) return fail(422, 'ValidationError', 'Invalid request: check body');
			return json(add(me, text, { videoId: b.videoId ?? null, videoMs: b.videoMs ?? null }));
		}
	}

	if (seg[0] === 'billing') {
		if (seg.length === 1 && method === 'GET') return json(billing());
		if (seg[1] === 'checkout' && method === 'POST') {
			const product = (body as { product?: string })?.product;
			if (product === 'membership' && !state.assessment) return fail(409, 'Conflict', 'The membership comes after the Initial Performance Assessment');
			return json({ url: `/dev/billing?pay=${product}` });
		}
		if (seg[1] === 'portal' && method === 'POST') return json({ url: '/dev/billing?portal=1' });
	}
	return undefined;
};
