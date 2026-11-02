/**
 * Dev-only in-memory stand-in for the player's session endpoints: check a drill off, and attach / replace / remove the
 * optional drill video. Uses the real request schema and the real rules (own finished swing videos only). The dev
 * pages seed it with their sessions. Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { FavoriteKind, SetItemCompletedRequest, SetItemVideoRequest, type FavoritesDto, type PlanSessionDto } from '@ttg/shared';
import { Schema } from 'effect';
import { mockVideoDto } from './mock-store';

const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const decode = <S extends Schema.Decoder<unknown, never>>(schema: S, body: unknown): S['Type'] | undefined => {
	try {
		return Schema.decodeUnknownSync(schema)(body) as S['Type'];
	} catch {
		return undefined;
	}
};

const sessions = new Map<string, PlanSessionDto>();
/** Puts sessions in the store (the preview page does this on load; existing ones are kept so a reload keeps attachments). */
export const seedMockSessions = (list: readonly PlanSessionDto[]) => {
	for (const s of list) if (!sessions.has(s.id)) sessions.set(s.id, s);
};
/** One stored session (with its check-offs and drill videos), if seeded. */
export const mockSession = (id: string) => sessions.get(id);
/** What the store holds now (the coach preview reads it to show what a player attached). */
export const mockSessions = () => [...sessions.values()];

const starredSessions = new Set<string>();
const starredDrills = new Set<string>();
/** The mock player's stars (the preview page loads them; they survive a reload until the dev server restarts). */
export const mockFavorites = (): FavoritesDto => ({ sessionIds: [...starredSessions], drillIds: [...starredDrills] });

export const planHandle = (method: string, rest: string, body: unknown): Response | undefined => {
	if (!dev) error(404, 'Not found');
	const seg = rest.split('/').filter(Boolean);
	if (seg[0] === 'drills' && seg.length === 2 && method === 'GET') {
		const known = [...sessions.values()].flatMap((s) => s.items).find((i) => i.drillId === seg[1]);
		if (!known) return undefined;
		return json({
			id: known.drillId, name: known.name, category: 'Practice', purpose: 'A short, repeatable drill.', setup: 'Grab a club and a few balls.', steps: ['Set up square.', 'Make a slow swing.', 'Check your finish.'],
			cues: null, successCriteria: 'Three clean reps in a row.', commonMistake: null, progression: null, regression: null, defaultMinutes: known.minutes, updatedAt: new Date().toISOString()
		});
	}
	if (seg[0] === 'favorites' && seg.length === 1 && method === 'GET') return json(mockFavorites());
	if (seg[0] === 'favorites' && seg.length === 3 && (method === 'PUT' || method === 'DELETE')) {
		// Mock sessions have short ids (s16), so only the kind goes through the real schema.
		const kind = decode(FavoriteKind, seg[1]);
		const target = kind ? { kind, id: seg[2]! } : undefined;
		const known = target?.kind === 'session' ? sessions.has(target.id) : [...sessions.values()].some((s) => s.items.some((i) => i.drillId === target?.id));
		if (!target || !known) return fail(404, 'NotFound', 'Not found');
		const set = target.kind === 'session' ? starredSessions : starredDrills;
		if (method === 'PUT') set.add(target.id);
		else set.delete(target.id);
		return json({ kind: target.kind, id: target.id, favorited: method === 'PUT' });
	}
	if (seg[0] !== 'sessions' || seg[2] !== 'items' || !seg[3]) return undefined;
	const s = sessions.get(seg[1]!);
	const item = s?.items.find((i) => i.id === seg[3]);
	if (!s || !item) return fail(404, 'NotFound', 'Session not found');
	const put = (next: PlanSessionDto) => (sessions.set(next.id, next), json(next));
	const map = (patch: Partial<PlanSessionDto['items'][number]>) => s.items.map((i) => (i.id === item.id ? { ...i, ...patch } : i));

	if (seg.length === 4 && method === 'PATCH') {
		const b = decode(SetItemCompletedRequest, body);
		if (!b) return fail(422, 'ValidationError', 'Invalid request: check completed');
		const items = map({ completedAt: b.completed ? (item.completedAt ?? new Date().toISOString()) : null });
		const done = items.every((i) => i.completedAt);
		return put({ ...s, items, completedAt: done ? (s.completedAt ?? new Date().toISOString()) : null });
	}
	if (seg.length === 5 && seg[4] === 'video' && method === 'PUT') {
		const b = decode(SetItemVideoRequest, body);
		const v = b ? mockVideoDto(b.videoId) : null;
		if (!v || v.kind !== 'swing' || v.status === 'pending' || v.status === 'failed') return fail(422, 'ValidationError', 'Invalid request: check videoId');
		return put({ ...s, items: map({ video: { id: v.id, status: v.status, title: v.title } }) });
	}
	if (seg.length === 5 && seg[4] === 'video' && method === 'DELETE') return put({ ...s, items: map({ video: null }) });
	return undefined;
};
