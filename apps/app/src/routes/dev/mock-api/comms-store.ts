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
/** The video of /dev/player: its thread is seeded below. */
export const PREVIEW_VIDEO = '22222222-2222-4222-8222-222222222222';

let seq = 0;
const messages: Mutable<MessageDto>[] = [];
const add = (senderId: string, body: string, over: Partial<MessageDto> = {}) => {
	const m: MessageDto = { id: crypto.randomUUID(), seq: ++seq, conversationId: CONVERSATION, senderId, body, videoId: null, videoMs: null, createdAt: nowIso(), readAt: null, ...over };
	messages.push(m);
	return m;
};
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
add(COACH, 'Welcome, Sam. Send me a down-the-line video of your 7 iron and we will start there.', { createdAt: ago(60 * 26) });
add(PLAYER, 'Will do. I tend to hit it fat when I get quick from the top.', { createdAt: ago(60 * 25) });
add(COACH, 'Nice tempo here. Watch where your hips are at 0:03 and compare with the next swing.', { videoId: PREVIEW_VIDEO, videoMs: 3200, createdAt: ago(60 * 3) });
add(PLAYER, 'Got it. Is the early slide what makes me hit it fat?', { videoId: PREVIEW_VIDEO, createdAt: ago(60 * 2.5) });
add(COACH, 'At 3.2 s your hips are already sliding. Watch this moment.', { videoId: VIDEO, videoMs: 3200, createdAt: ago(60 * 2) });
add(COACH, 'Also bring your driver to the next lesson.', { createdAt: ago(40) });
add(COACH, 'And a few balls you do not mind losing.', { createdAt: ago(39) });
// Read receipts for the preview: the player has read the welcome (msg 1) and the coach has read the player's first reply (msg 2);
// the coach's video messages and the two newest general ones are still "Delivered"; the player's video question is unread.
messages[0]!.readAt = ago(60 * 25.5);
messages[1]!.readAt = ago(60 * 24.9);

const state = {
	paid: true,
	assessment: false,
	membership: true,
	pastDue: false,
	/** What the stored subscription says (what the webhook has recorded). */
	cancelAtPeriodEnd: false,
	/** Stand-in for webhook delay: a cancel/resume is accepted at once but only recorded after this many ms; -1 = never arrives. */
	webhookDelayMs: 3000,
	/** Make cancel/resume fail like a Stripe outage. */
	cancelFails: false,
	/** A change Stripe accepted that the webhook has not recorded yet. */
	change: null as null | { to: boolean; at: number },
	notifications: [
		{ id: 'n1', type: 'plan_assigned', payload: { planTitle: 'Short game, week 1' }, readAt: null, createdAt: ago(90) },
		{ id: 'n2', type: 'video_ready', payload: { videoId: VIDEO, title: 'Driver, down the line' }, readAt: ago(30), createdAt: ago(60 * 5) }
	] as Mutable<NotificationDto>[]
};

/** The coach's "Opened by ..." line for the preview video. `/__analysisview` sets it; a player's `POST analyses/:id/view` opens it. */
const analysisView = { state: 'unopened' as 'unpublished' | 'unopened' | 'opened', firstViewedAt: null as string | null, lastViewedAt: null as string | null, updatedSinceOpened: false };

const unreadMsgs = (me: string) => messages.filter((m) => m.senderId !== me && !m.readAt);
const unreadFor = (me: string) => unreadMsgs(me).length;
const general = (list: readonly MessageDto[]) => list.filter((m) => m.videoId === null);
/** `?videoId=` / `?scope=general` as the real API reads them. */
const inScope = (m: MessageDto, url: URL) => {
	const v = url.searchParams.get('videoId');
	if (v) return m.videoId === v;
	return url.searchParams.get('scope') === 'general' ? m.videoId === null : true;
};
/**
 * Who is asking: `?as=coach|player` when the page names it (the first message fetch does); the thread's own later calls
 * (read, receipts, poll) carry no such parameter, so they use whoever named themselves last. Fine for one preview tab.
 */
let lastAs: 'coach' | 'player' = 'player';
const meOf = (url: URL) => {
	const as = url.searchParams.get('as');
	if (as === 'coach' || as === 'player') lastAs = as;
	return lastAs === 'coach' ? COACH : PLAYER;
};

const conversationFor = (me: string): ConversationDto => ({
	id: CONVERSATION,
	other: me === PLAYER ? { id: COACH, displayName: 'Trey Thornock', email: null, role: 'coach' } : { id: PLAYER, displayName: 'Sam Rivera', email: null, role: 'player' },
	lastMessage: general(messages).at(-1) ?? null,
	unread: general(unreadMsgs(me)).length,
	videoUnread: unreadFor(me) - general(unreadMsgs(me)).length,
	videoUnreadVideoId: unreadMsgs(me).filter((m) => m.videoId).at(-1)?.videoId ?? null,
	updatedAt: messages.at(-1)?.createdAt ?? nowIso()
});

/** The webhook "arrives": apply a pending change once its delay has passed. */
const landWebhook = () => {
	if (state.change && state.webhookDelayMs >= 0 && Date.now() >= state.change.at) {
		state.cancelAtPeriodEnd = state.change.to;
		state.change = null;
	}
};

const billing = (): BillingDto => {
	landWebhook();
	const ent = entitlementsFor({
		assessmentPaid: state.assessment || state.membership,
		subscription: state.membership
			? { status: state.pastDue ? 'past_due' : 'active', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000), pastDueSince: state.pastDue ? new Date(Date.now() - 2 * 86_400_000) : null, cancelAtPeriodEnd: state.cancelAtPeriodEnd }
			: null,
		now: new Date()
	});
	return {
		assessmentPaid: state.assessment || state.membership,
		subscription: state.membership ? { status: state.pastDue ? 'past_due' : 'active', currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000).toISOString(), cancelAtPeriodEnd: state.cancelAtPeriodEnd } : null,
		entitlements: { assessment: ent.assessment, membership: ent.membership, pastDue: ent.pastDue, graceEndsAt: ent.graceEndsAt?.toISOString() ?? null, endsAt: ent.endsAt?.toISOString() ?? null },
		payments: [
			...(state.assessment || state.membership ? [{ id: 'p1', kind: 'assessment', amountCents: 14900, currency: 'usd', status: 'paid', paidAt: ago(60 * 24 * 20) }] : []),
			...(state.membership ? [{ id: 'p2', kind: 'membership', amountCents: 4900, currency: 'usd', status: 'paid', paidAt: ago(60 * 24 * 10) }] : [])
		],
		canManage: state.membership || state.assessment
	};
};

/** Preview controls: `/__set` changes what the mock says (billing stage), `/__peer` makes the other person send a message, `/__readall` makes someone read the whole thread. */
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

	// Preview control: `{ by: 'coach' | 'player' }` reads everything the other side has sent (a real read of the whole conversation).
	if (seg[0] === '__readall' && method === 'POST') {
		const by = (body as { by?: string })?.by === 'coach' ? COACH : PLAYER;
		for (const m of messages) if (m.senderId !== by && !m.readAt) m.readAt = nowIso();
		return json({ ok: true });
	}
	// Preview control: `{ state: 'unpublished' | 'unopened' | 'opened' | 'updated' }` sets the coach's "Opened by ..." line.
	if (seg[0] === '__analysisview' && method === 'POST') {
		const st = (body as { state?: string })?.state ?? 'unopened';
		analysisView.state = st === 'unpublished' ? 'unpublished' : st === 'unopened' ? 'unopened' : 'opened';
		analysisView.firstViewedAt = analysisView.state === 'opened' ? ago(60 * 5) : null;
		analysisView.lastViewedAt = analysisView.state === 'opened' ? ago(60 * 4) : null;
		analysisView.updatedSinceOpened = st === 'updated';
		return json({ ok: true });
	}
	if (seg[0] === 'videos' && seg[2] === 'analysis-view' && method === 'GET') return json({ playerName: 'Sam Rivera', ...analysisView });
	if (seg[0] === 'analyses' && seg[2] === 'view' && method === 'POST') {
		// only the player's own open counts, never the coach's preview, and never a draft
		if (me !== PLAYER || analysisView.state === 'unpublished') return json({ recorded: false });
		analysisView.firstViewedAt ??= nowIso();
		analysisView.lastViewedAt = nowIso();
		analysisView.state = 'opened';
		return json({ recorded: true });
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
		if (seg[2] === 'receipts' && method === 'GET') {
			const from = Number(url.searchParams.get('from') ?? 0);
			return json({ receipts: messages.filter((m) => m.senderId === me && m.readAt && m.seq >= from && inScope(m, url)).map((m) => ({ id: m.id, seq: m.seq, readAt: m.readAt })) });
		}
		if (seg[2] === 'read' && method === 'POST') {
			// as the real API: only the other side's messages in the thread, and only the `from`..`upTo` range when given
			const from = url.searchParams.has('from') ? Number(url.searchParams.get('from')) : 0;
			const upTo = url.searchParams.has('upTo') ? Number(url.searchParams.get('upTo')) : Infinity;
			for (const m of messages) if (m.senderId !== me && !m.readAt && inScope(m, url) && m.seq >= from && m.seq <= upTo) m.readAt = nowIso();
			if (unreadMsgs(me).length === 0) for (const n of state.notifications) if (n.type === 'message') n.readAt ??= nowIso();
			return json({ unread: { messages: 0, notifications: state.notifications.filter((n) => !n.readAt).length } });
		}
		if (seg[2] === 'messages' && method === 'GET') {
			const after = url.searchParams.get('after');
			const before = url.searchParams.get('before');
			let list = messages.filter((m) => inScope(m, url) && (after ? m.seq > Number(after) : true) && (before ? m.seq < Number(before) : true));
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
			// sending reads the thread, but only the range the sender had on screen
			const sentVideo = b.videoId ?? null;
			for (const m of messages) {
				if (m.senderId !== me && !m.readAt && m.videoId === sentVideo && m.seq >= (b.seenFromSeq ?? 0) && m.seq <= (b.seenSeq ?? seq)) m.readAt = nowIso();
			}
			return json(add(me, text, { videoId: sentVideo, videoMs: b.videoMs ?? null }));
		}
	}

	if (seg[0] === 'billing') {
		if (seg.length === 1 && method === 'GET') return json(billing());
		if (seg[1] === 'checkout' && method === 'POST') {
			const product = (body as { product?: string })?.product;
			if (product === 'membership' && !state.assessment) return fail(409, 'Conflict', 'The membership comes after the Initial Performance Assessment');
			return json({ url: `/dev/billing?pay=${product}` });
		}
		if ((seg[1] === 'cancel' || seg[1] === 'resume') && method === 'POST') {
			if (!state.membership) return fail(409, 'Conflict', "You don't have a membership to change.");
			if (state.cancelFails) return fail(402, 'PaymentError', "We couldn't reach Stripe to change your membership. Nothing was changed. Please try again in a moment.");
			landWebhook();
			const to = seg[1] === 'cancel';
			const endsAt = new Date(Date.now() + 20 * 86_400_000).toISOString();
			if ((state.change?.to ?? state.cancelAtPeriodEnd) === to) return json({ accepted: true, action: seg[1], alreadyApplied: true, endsAt });
			state.change = { to, at: Date.now() + Math.max(0, state.webhookDelayMs) };
			return json({ accepted: true, action: seg[1], alreadyApplied: false, endsAt });
		}
		if (seg[1] === 'portal' && method === 'POST') return json({ url: '/dev/billing?portal=1' });
	}
	return undefined;
};
