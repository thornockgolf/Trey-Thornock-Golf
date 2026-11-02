/**
 * Dev-only in-memory stand-in for `/api/logged-sessions`, using the real request schemas and the real rules (empty
 * log, future date, video must exist). Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { CreateLoggedSessionRequest, UpdateLoggedSessionRequest, emptyLogProblem, logDateProblem, normalizeTags, type LoggedSessionDto } from '@ttg/shared';
import { Schema } from 'effect';

const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const decode = <S extends Schema.Decoder<unknown, never>>(schema: S, body: unknown): S['Type'] | undefined => {
	try {
		return Schema.decodeUnknownSync(schema)(body) as S['Type'];
	} catch {
		return undefined;
	}
};
const blank = (s: string | null | undefined) => (s === undefined ? undefined : s === null || s.trim() === '' ? null : s.trim());

const logs: LoggedSessionDto[] = [];
/** Puts a log in the store (the edit preview opens one that already exists). */
export const seedLogged = (l: LoggedSessionDto) => {
	const i = logs.findIndex((x) => x.id === l.id);
	if (i >= 0) logs[i] = l;
	else logs.push(l);
};

/** Drill names the preview page registers, so a saved log shows them. */
export const mockLoggedState = { drills: [] as { id: string; name: string }[] };

export const loggedHandle = (method: string, rest: string, body: unknown): Response | undefined => {
	if (!dev) error(404, 'Not found');
	const seg = rest.split('/').filter(Boolean);
	if (seg[0] !== 'logged-sessions') return undefined;
	const today = new Date().toISOString().slice(0, 10);
	const names = (ids: readonly string[]) => ids.map((id) => ({ id, name: mockLoggedState.drills.find((d) => d.id === id)?.name ?? 'Drill' }));
	const video = (id: string | null | undefined): LoggedSessionDto['video'] => (id ? { id, status: 'processing', title: null } : null);

	if (seg.length === 1 && method === 'GET') return json({ sessions: [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)) });
	if (seg.length === 1 && method === 'POST') {
		const b = decode(CreateLoggedSessionRequest, body);
		if (!b) return fail(422, 'ValidationError', 'Invalid request: check the fields');
		const bad = logDateProblem(b.date, today) ?? emptyLogProblem(b);
		if (bad) return fail(422, 'ValidationError', bad);
		const made: LoggedSessionDto = {
			id: crypto.randomUUID(), playerId: 'p', date: b.date, tags: normalizeTags(b.tags), minutes: b.minutes ?? null, workedOn: blank(b.workedOn) ?? null,
			drills: names(b.drillIds ?? []), notes: blank(b.notes) ?? null, video: video(b.videoId), createdAt: new Date().toISOString()
		};
		logs.push(made);
		return json(made);
	}
	const i = logs.findIndex((l) => l.id === seg[1]);
	if (seg.length === 2 && method === 'PATCH') {
		if (i < 0) return fail(404, 'NotFound', 'Session not found');
		const b = decode(UpdateLoggedSessionRequest, body);
		if (!b) return fail(422, 'ValidationError', 'Invalid request: check the fields');
		if (b.date !== undefined) {
			const bad = logDateProblem(b.date, today);
			if (bad) return fail(422, 'ValidationError', bad);
		}
		const cur = logs[i]!;
		const next: LoggedSessionDto = {
			...cur,
			date: b.date ?? cur.date,
			tags: b.tags ? normalizeTags(b.tags) : cur.tags,
			minutes: b.minutes === undefined ? cur.minutes : b.minutes,
			workedOn: b.workedOn === undefined ? cur.workedOn : (blank(b.workedOn) ?? null),
			drills: b.drillIds ? names(b.drillIds) : cur.drills,
			notes: b.notes === undefined ? cur.notes : (blank(b.notes) ?? null),
			video: b.videoId === undefined ? cur.video : cur.video?.id === b.videoId ? cur.video : video(b.videoId)
		};
		const empty = emptyLogProblem({ tags: next.tags, workedOn: next.workedOn, notes: next.notes, drillIds: next.drills.map((d) => d.id) });
		if (empty) return fail(422, 'ValidationError', empty);
		logs[i] = next;
		return json(next);
	}
	if (seg.length === 2 && method === 'DELETE') {
		if (i < 0) return fail(404, 'NotFound', 'Session not found');
		logs.splice(i, 1);
		return json({ ok: true });
	}
	return undefined;
};
