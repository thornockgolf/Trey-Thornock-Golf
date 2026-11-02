/** Pure helpers for the "Log a session" form: no DOM, so they are unit tested. */
import {
	MAX_LOGGED_DAYS_BACK,
	MAX_LOGGED_MINUTES,
	MAX_LOGGED_NOTES,
	MAX_LOGGED_WORKED_ON,
	SESSION_TAGS,
	addDays,
	emptyLogProblem,
	type CreateLoggedSessionRequest,
	type LoggedSessionDto,
	type SessionTag,
	type UpdateLoggedSessionRequest
} from '@ttg/shared';

export interface LogFormValues {
	/** `YYYY-MM-DD`, the player's local day. */
	date: string;
	tags: readonly SessionTag[];
	/** The field as typed; blank means "not said". A text input gives a string, but numbers/null are tolerated. */
	minutes: string | number | null | undefined;
	workedOn: string;
	drillIds: readonly string[];
	notes: string;
	videoId: string | null;
}

export const blankForm = (today: string): LogFormValues => ({ date: today, tags: [], minutes: '', workedOn: '', drillIds: [], notes: '', videoId: null });

export const formFromLogged = (l: LoggedSessionDto): LogFormValues => ({
	date: l.date,
	tags: l.tags,
	minutes: l.minutes === null ? '' : String(l.minutes),
	workedOn: l.workedOn ?? '',
	drillIds: l.drills.map((d) => d.id),
	notes: l.notes ?? '',
	videoId: l.video?.id ?? null
});

/** Adds or removes a tag, keeping the canonical order (Mechanical technique, Skill, Situational practice). */
export const toggleTag = (tags: readonly SessionTag[], tag: SessionTag): SessionTag[] =>
	SESSION_TAGS.filter((t) => (t === tag ? !tags.includes(t) : tags.includes(t)));

/** Earliest date the date picker offers. */
export const earliestDate = (today: string) => addDays(today, -MAX_LOGGED_DAYS_BACK) ?? today;

/** A problem to show before sending, or null. The server checks the same rules again. */
export const formProblem = (v: LogFormValues, today: string): string | null => {
	if (!v.date) return 'Pick the day you practised';
	if (v.date > today) return 'You cannot log a session in the future';
	if (v.date < earliestDate(today)) return 'That date is too far back';
	const minutes = parseMinutes(v.minutes);
	if (minutes === 'invalid') return `Minutes should be a whole number from 1 to ${MAX_LOGGED_MINUTES}`;
	if (v.workedOn.length > MAX_LOGGED_WORKED_ON) return `What you worked on can be up to ${MAX_LOGGED_WORKED_ON} characters`;
	if (v.notes.length > MAX_LOGGED_NOTES) return `Notes can be up to ${MAX_LOGGED_NOTES} characters`;
	return emptyLogProblem(v);
};

/** Blank is no minutes; a whole number from 1 up is minutes; anything else is invalid. */
export const parseMinutes = (value: string | number | null | undefined): number | null | 'invalid' => {
	if (value === null || value === undefined) return null;
	if (typeof value === 'number') return Number.isInteger(value) && value >= 1 && value <= MAX_LOGGED_MINUTES ? value : 'invalid';
	if (typeof value !== 'string') return 'invalid';
	const t = value.trim();
	if (t === '') return null;
	if (!/^\d+$/.test(t)) return 'invalid';
	const n = Number(t);
	return n >= 1 && n <= MAX_LOGGED_MINUTES ? n : 'invalid';
};

/** Body for `POST /api/logged-sessions`. Call after `formProblem` returned null. */
export const toCreateRequest = (v: LogFormValues): CreateLoggedSessionRequest => {
	const minutes = parseMinutes(v.minutes);
	return {
		date: v.date,
		tags: v.tags,
		...(typeof minutes === 'number' ? { minutes } : {}),
		...(v.workedOn.trim() ? { workedOn: v.workedOn.trim() } : {}),
		...(v.drillIds.length > 0 ? { drillIds: v.drillIds } : {}),
		...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
		...(v.videoId ? { videoId: v.videoId } : {})
	};
};

/** Body for `PATCH /api/logged-sessions/:id`: every field is sent, so cleared fields are cleared (`null`). */
export const toUpdateRequest = (v: LogFormValues): UpdateLoggedSessionRequest => {
	const minutes = parseMinutes(v.minutes);
	return {
		date: v.date,
		tags: v.tags,
		minutes: typeof minutes === 'number' ? minutes : null,
		workedOn: v.workedOn.trim() || null,
		drillIds: v.drillIds,
		notes: v.notes.trim() || null,
		videoId: v.videoId
	};
};

/** What to call a video's state in words. */
export const videoStateLabel = (status: 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed'): string =>
	status === 'ready' ? 'Ready to watch' : status === 'failed' ? 'Could not be processed' : 'Still processing; it will show as ready in a minute or two';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The `?date=` prefill of the log form: an ISO day that is real, not after today and at most
 * `MAX_LOGGED_DAYS_BACK` days back. Anything else is ignored and the form defaults to today.
 */
export const parseDateParam = (value: string | null | undefined, today: string): string => {
	if (!value || !ISO_DAY.test(value)) return today;
	// a round trip rejects impossible days such as 2026-02-30
	if (addDays(value, 0) !== value) return today;
	if (value > today || value < earliestDate(today)) return today;
	return value;
};

/** Internal pages a save or cancel may return to. Anything else is not allowed (no open redirects). */
export const RETURN_PATHS = ['/calendar', '/plans', '/'] as const;

/** The `?returnTo=` of the log pages: only an exact allow-listed path, else `fallback`. */
export const safeReturnTo = (value: string | null | undefined, fallback = '/plans'): string =>
	(RETURN_PATHS as readonly string[]).includes(value ?? '') ? (value as string) : fallback;

/** The link to the check-in form, optionally for one day and with a way back. */
export const checkInHref = (opts: { date?: string; returnTo?: (typeof RETURN_PATHS)[number] } = {}): string => {
	const q = new URLSearchParams();
	if (opts.date) q.set('date', opts.date);
	if (opts.returnTo) q.set('returnTo', opts.returnTo);
	const s = q.toString();
	return s ? `/check-ins/new?${s}` : '/check-ins/new';
};

/** The link to the log form, optionally for one day and with a way back. */
export const logHref = (opts: { date?: string; returnTo?: (typeof RETURN_PATHS)[number] } = {}): string => {
	const q = new URLSearchParams();
	if (opts.date) q.set('date', opts.date);
	if (opts.returnTo) q.set('returnTo', opts.returnTo);
	const s = q.toString();
	return s ? `/sessions/new?${s}` : '/sessions/new';
};
