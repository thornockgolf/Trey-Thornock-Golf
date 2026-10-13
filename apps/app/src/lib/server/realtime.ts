import { Realtime } from '@ttg/db';
import { Schema } from 'effect';
import { Effect } from 'effect';
import { Uuid, conversationTopic, userTopic } from '@ttg/shared';
import { currentUser } from './auth';
import { participantConversation } from './chat';
import { decodeBody } from './decode';

const TokenRequest = Schema.Union([
	Schema.Struct({ channel: Schema.Literal('conversation'), conversationId: Uuid }),
	Schema.Struct({ channel: Schema.Literal('user') })
]);

/**
 * `POST /api/realtime/token`: a token (5 minutes at most) for exactly one channel, after the app
 * checks the user may be on it: the conversation's two people, or the user's own channel. When
 * Realtime is not configured the answer is `{ enabled: false }` and the page polls instead.
 */
export const mintRealtimeToken = Effect.gen(function* () {
	const user = yield* currentUser;
	const body = yield* decodeBody(TokenRequest);
	const realtime = yield* Realtime;
	const topic =
		body.channel === 'user' ? userTopic(user.id) : conversationTopic((yield* participantConversation(user.id, body.conversationId)).id);
	const minted = yield* realtime.mintToken({ userId: user.id, topic });
	if (!minted || !realtime.clientConfig) return { enabled: false as const };
	return { enabled: true as const, topic, token: minted.token, expiresAt: minted.expiresAt.toISOString(), url: realtime.clientConfig.url, anonKey: realtime.clientConfig.anonKey };
});
