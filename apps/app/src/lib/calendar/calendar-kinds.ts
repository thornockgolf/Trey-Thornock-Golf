import type { CalendarKind } from '@ttg/shared';

/**
 * Legend labels and badge presets per calendar kind. To the player a planned session and one they logged themselves
 * are the same thing, "Practice" (internally the kind stays `logged`); only the planned ones move plan progress.
 */
export const KIND_LABEL: Record<CalendarKind, string> = { session: 'Practice', logged: 'Practice', checkin: 'Check-in', assessment: 'Test' };
export const KIND_CHIP: Record<CalendarKind, string> = { session: 'preset-tonal-primary', logged: 'preset-tonal-primary', checkin: 'preset-tonal-tertiary', assessment: 'preset-tonal-secondary' };
/** The kinds the legend and the day markers show: a logged session is a Practice. */
export const LEGEND_KINDS = ['session', 'checkin', 'assessment'] as const satisfies readonly CalendarKind[];
/** Quiet tag that tells a self-logged practice session from a planned one. */
export const ADDED_BY_YOU = 'Added by you';
