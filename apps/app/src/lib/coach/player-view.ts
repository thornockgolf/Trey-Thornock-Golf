import type { PlanSessionDto } from '@ttg/shared';

export interface PlanProgress {
	sessions: number;
	sessionsDone: number;
	drills: number;
	drillsDone: number;
}

/** How far through their assigned sessions a player is (drills checked off, sessions done). */
export const sessionProgress = (sessions: readonly PlanSessionDto[]): PlanProgress => ({
	sessions: sessions.length,
	sessionsDone: sessions.filter((s) => s.completedAt).length,
	drills: sessions.reduce((n, s) => n + s.items.length, 0),
	drillsDone: sessions.reduce((n, s) => n + s.items.filter((i) => i.completedAt).length, 0)
});
