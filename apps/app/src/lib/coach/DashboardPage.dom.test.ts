import { cleanup, render, screen } from '@testing-library/svelte';
import type { PlayerSummaryDto, UnreadThreadDto, VideoToRecordDto } from '@ttg/shared';
import { afterEach, describe, expect, it } from 'vitest';
import DashboardPage from './DashboardPage.svelte';

afterEach(cleanup);

const player: PlayerSummaryDto = { id: 'p1', displayName: 'Jordan Ellis', email: null, assigned: true, joinedAt: '2026-10-01T00:00:00Z', newVideos: 0, lastVideoAt: null, upcomingSessions: 0, completedSessions: 0, hasQuestionnaire: true, unreadMessages: 0 };
const video = (id: string, title: string | null): VideoToRecordDto => ({ videoId: id, title, createdAt: '2026-11-02T12:00:00Z', durationMs: 10_000, posterUrl: null, playerId: 'p1', playerName: 'Jordan Ellis', playerEmail: null });
const thread = (over: Partial<UnreadThreadDto>): UnreadThreadDto => ({ conversationId: 'c1', playerId: 'p1', playerName: 'Jordan Ellis', playerEmail: null, videoId: null, videoTitle: null, unread: 2, latestAt: '2026-11-02T12:00:00Z', preview: 'Hello coach', ...over });

describe('coach dashboard: videos to record and messages from players', () => {
	it('links each video straight to the recorder and each thread to its conversation or video', () => {
		render(DashboardPage, {
			players: [player],
			videosToRecord: [video('v1', 'Driver'), video('v2', null)],
			unreadThreads: [thread({}), thread({ conversationId: 'c2', videoId: 'v9', videoTitle: 'Wedge', unread: 1 })]
		});
		const record = [...document.querySelectorAll('[data-record-row] a')].map((a) => a.getAttribute('href'));
		expect(record).toEqual(['/coach/videos/v1/analyze', '/coach/videos/v2/analyze']);
		expect(document.querySelector('[data-to-record-count]')?.textContent).toBe('2');
		const threads = [...document.querySelectorAll('[data-thread-row] a')].map((a) => a.getAttribute('href'));
		expect(threads).toEqual(['/messages/c1', '/videos/v9']);
		expect(document.querySelector('[data-unread-count]')?.textContent).toBe('3');
		expect(screen.getByText(/About Wedge/)).toBeTruthy();
		expect(screen.getByText(/General chat/)).toBeTruthy();
		// an untitled video does not repeat its date
		expect(screen.getByText(/^Swing, Nov 2, 2026 · 0:10$/)).toBeTruthy();
	});

	it('shows friendly empty states', () => {
		render(DashboardPage, { players: [player] });
		expect(document.querySelector('[data-to-record-empty]')).toBeTruthy();
		expect(document.querySelector('[data-unread-empty]')).toBeTruthy();
		expect(document.querySelector('[data-to-record-count]')?.textContent).toBe('0');
	});
});
