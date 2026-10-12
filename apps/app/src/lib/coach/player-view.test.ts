import type { PlanSessionDto } from '@ttg/shared';
import { describe, expect, it } from 'vitest';
import { sessionProgress } from './player-view';

const session = (done: boolean[], completedAt: string | null = null): PlanSessionDto => ({
	id: crypto.randomUUID(), assignmentId: 'a', title: 't', planTitle: 'p', scheduledOn: '2026-10-12', durationMin: 30, completedAt,
	items: done.map((d, i) => ({ id: String(i), drillId: 'd', name: 'x', minutes: 10, completedAt: d ? '2026-10-12T10:00:00Z' : null }))
});

describe('sessionProgress', () => {
	it('counts sessions and drills done', () => {
		expect(sessionProgress([session([true, true], 'x'), session([true, false]), session([false])])).toEqual({ sessions: 3, sessionsDone: 1, drills: 5, drillsDone: 3 });
		expect(sessionProgress([])).toEqual({ sessions: 0, sessionsDone: 0, drills: 0, drillsDone: 0 });
	});
});
