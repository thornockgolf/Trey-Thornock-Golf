import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
import type { UnreadThreadDto, VideoToRecordDto } from '@ttg/shared';
import { seedPlayers } from '../mock-api/coach-store';
import type { PageServerLoad } from './$types';

// Dev-only preview of the coach dashboard without a Clerk session or Postgres (in-memory mock API):
//   /dev/coach          two players, one more waiting to be added, videos to record and unread messages
//   /dev/coach?state=empty   no players at all      /dev/coach?state=caught-up   players, nothing to record or read
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const P1 = '00000000-0000-4000-8000-00000000aa01';
const P2 = '00000000-0000-4000-8000-00000000aa02';
const toRecord = (n: number, playerId: string, playerName: string | null, title: string | null, h: number): VideoToRecordDto => ({
	videoId: `00000000-0000-4000-8000-00000000bb0${n}`,
	title,
	createdAt: hoursAgo(h),
	durationMs: 8000 + n * 2300,
	posterUrl: null,
	playerId,
	playerName,
	playerEmail: playerName ? null : 'sam.rivera@example.com'
});
const videosToRecord = (): VideoToRecordDto[] => [
	toRecord(1, P1, 'Jordan Ellis', 'Driver, down the line', 3),
	toRecord(2, P2, null, null, 30),
	toRecord(3, P1, 'Jordan Ellis', 'Wedge face on, with a very long title that has to wrap on a phone screen', 80)
];
const unreadThreads = (): UnreadThreadDto[] => [
	{ conversationId: '00000000-0000-4000-8000-00000000cc01', playerId: P1, playerName: 'Jordan Ellis', playerEmail: null, videoId: '00000000-0000-4000-8000-00000000bb01', videoTitle: 'Driver, down the line', unread: 2, latestAt: hoursAgo(1), preview: 'Is my hip turning too early here? It feels like I lose it at the top.' },
	{ conversationId: '00000000-0000-4000-8000-00000000cc02', playerId: P2, playerName: null, playerEmail: 'sam.rivera@example.com', videoId: null, videoTitle: null, unread: 1, latestAt: hoursAgo(26), preview: 'Can we move Thursday to Friday?' }
];

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	return {
		players: state === 'empty' ? [] : seedPlayers(),
		videosToRecord: state === 'empty' || state === 'caught-up' ? [] : videosToRecord(),
		unreadThreads: state === 'empty' || state === 'caught-up' ? [] : unreadThreads()
	};
};
