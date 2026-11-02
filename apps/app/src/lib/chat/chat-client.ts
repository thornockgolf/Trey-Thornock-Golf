import type { ConversationDto, MessageDto, MessagePageDto, ReceiptsDto } from '@ttg/shared';

export class ChatError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly billingUrl?: string
	) {
		super(message);
	}
}

const asError = async (res: Response) => {
	const body = (await res.json().catch(() => ({}))) as { message?: string; billingUrl?: string };
	return new ChatError(body.message ?? 'Something went wrong', res.status, body.billingUrl);
};

/** What a video page needs for its thread (`videoThreadData` on the server). */
export interface VideoThreadData {
	me: string;
	conversation: ConversationDto;
	messages: readonly MessageDto[];
	hasMore: boolean;
	compose: { allowed: boolean; reason: 'ended' | 'payment' | 'past_due' | null };
}

/** Which messages of the conversation: the general thread (the Messages tab) or one video's thread. Without one, every message. */
export type ThreadScope = 'general' | { videoId: string };

const scopeQuery = (scope: ThreadScope | undefined) => (scope === undefined ? [] : scope === 'general' ? ['scope=general'] : [`videoId=${scope.videoId}`]);
const withQuery = (url: string, parts: readonly string[]) => (parts.length > 0 ? `${url}?${parts.join('&')}` : url);

/** The conversation endpoints. `base` is `/api` in the app and a mock path in previews. */
export const chatApi = (base: string, conversationId: string, scope?: ThreadScope, fetchFn: typeof fetch = fetch) => ({
	async send(input: { body: string; videoId?: string; videoMs?: number; seenSeq?: number; seenFromSeq?: number }): Promise<MessageDto> {
		const res = await fetchFn(`${base}/conversations/${conversationId}/messages`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify(input)
		});
		if (!res.ok) throw await asError(res);
		return (await res.json()) as MessageDto;
	},
	/** Messages newer than the cursor (catch-up after a reconnect, or the poll). */
	async after(seq: number | undefined): Promise<MessageDto[]> {
		const res = await fetchFn(withQuery(`${base}/conversations/${conversationId}/messages`, [...(seq !== undefined ? [`after=${seq}`] : []), ...scopeQuery(scope)]));
		if (!res.ok) throw await asError(res);
		return [...((await res.json()) as MessagePageDto).messages];
	},
	async before(seq: number): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
		const res = await fetchFn(withQuery(`${base}/conversations/${conversationId}/messages`, [`before=${seq}`, ...scopeQuery(scope)]));
		if (!res.ok) throw await asError(res);
		const page = (await res.json()) as MessagePageDto;
		return { messages: [...page.messages], hasMore: page.hasMore };
	},
	/** Mark the other side's messages read: only `from`..`upTo` (what is loaded and on screen); without a range, all of the thread. */
	async markRead(range?: { from?: number; upTo?: number }): Promise<void> {
		const q = [...scopeQuery(scope), ...(range?.from !== undefined ? [`from=${range.from}`] : []), ...(range?.upTo !== undefined ? [`upTo=${range.upTo}`] : [])];
		await fetchFn(withQuery(`${base}/conversations/${conversationId}/read`, q), { method: 'POST' }).catch(() => undefined);
	},
	/** Which of my messages from `fromSeq` on the other side has read. */
	async receipts(fromSeq: number): Promise<ReceiptsDto['receipts']> {
		const res = await fetchFn(withQuery(`${base}/conversations/${conversationId}/receipts`, [`from=${fromSeq}`, ...scopeQuery(scope)]));
		if (!res.ok) throw await asError(res);
		return [...((await res.json()) as ReceiptsDto).receipts];
	}
});

export const conversationName = (c: Pick<ConversationDto, 'other'>) => c.other.displayName?.trim() || c.other.email?.trim() || (c.other.role === 'coach' ? 'Your coach' : 'Player');
