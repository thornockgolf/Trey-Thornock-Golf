import type { ConversationDto, MessageDto, MessagePageDto } from '@ttg/shared';

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

/** The conversation endpoints. `base` is `/api` in the app and a mock path in previews. */
export const chatApi = (base: string, conversationId: string, fetchFn: typeof fetch = fetch) => ({
	async send(input: { body: string; videoId?: string; videoMs?: number }): Promise<MessageDto> {
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
		const res = await fetchFn(`${base}/conversations/${conversationId}/messages${seq !== undefined ? `?after=${seq}` : ''}`);
		if (!res.ok) throw await asError(res);
		return [...((await res.json()) as MessagePageDto).messages];
	},
	async before(seq: number): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
		const res = await fetchFn(`${base}/conversations/${conversationId}/messages?before=${seq}`);
		if (!res.ok) throw await asError(res);
		const page = (await res.json()) as MessagePageDto;
		return { messages: [...page.messages], hasMore: page.hasMore };
	},
	async markRead(): Promise<void> {
		await fetchFn(`${base}/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => undefined);
	}
});

export const conversationName = (c: Pick<ConversationDto, 'other'>) => c.other.displayName?.trim() || c.other.email?.trim() || (c.other.role === 'coach' ? 'Your coach' : 'Player');
