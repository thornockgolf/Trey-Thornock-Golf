/**
 * Dev-only in-memory stand-in for `/api/videos/:id/annotations`, so the annotation UI can be driven without Clerk or
 * Postgres. It uses the real request schemas and the same rules as the real handlers (version conflicts, ranges).
 * Lost on restart.
 */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { CreateAnnotationRequest, UpdateAnnotationRequest, type AnnotationDto } from '@ttg/shared';
import { Schema } from 'effect';
import { CLIP_SECONDS } from './media';

const rows = new Map<string, AnnotationDto[]>();
const now = () => new Date().toISOString();

const seed = (videoId: string): AnnotationDto[] => [
	{
		id: crypto.randomUUID(),
		videoId,
		authorId: 'coach',
		startMs: 1000,
		endMs: 3000,
		version: 1,
		createdAt: now(),
		updatedAt: now(),
		shape: { v: 1, type: 'arrow', color: '#D4A017', width: 0.006, a: { x: 0.2, y: 0.2 }, b: { x: 0.45, y: 0.5 } }
	},
	{
		id: crypto.randomUUID(),
		videoId,
		authorId: 'coach',
		startMs: 2000,
		endMs: 5000,
		version: 1,
		createdAt: now(),
		updatedAt: now(),
		shape: { v: 1, type: 'angle', color: '#FFFFFF', width: 0.005, a: { x: 0.6, y: 0.25 }, vertex: { x: 0.7, y: 0.6 }, b: { x: 0.9, y: 0.7 } }
	}
];

export const guard = () => {
	if (!dev) error(404, 'Not found');
};
const list = (videoId: string) => {
	if (!rows.has(videoId)) rows.set(videoId, seed(videoId));
	return rows.get(videoId)!;
};
const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const DURATION = CLIP_SECONDS * 1000;
const decode = <S extends Schema.Decoder<unknown, never>>(schema: S, body: unknown) => {
	try {
		return Schema.decodeUnknownSync(schema)(body) as S['Type'];
	} catch {
		return undefined;
	}
};
const badRange = (s: number, e: number) => s > e || e > DURATION;

export const listAnnotations = (videoId: string) => (guard(), json({ annotations: [...list(videoId)].sort((a, b) => a.startMs - b.startMs) }));

export const createAnnotation = (videoId: string, body: unknown) => {
	guard();
	const b = decode(CreateAnnotationRequest, body);
	if (!b || badRange(b.startMs, b.endMs)) return fail(422, 'ValidationError', 'Invalid request');
	const row: AnnotationDto = { id: crypto.randomUUID(), videoId, authorId: 'coach', startMs: b.startMs, endMs: b.endMs, shape: b.shape, version: 1, createdAt: now(), updatedAt: now() };
	list(videoId).push(row);
	return json(row);
};

export const updateAnnotation = (videoId: string, id: string, body: unknown) => {
	guard();
	const b = decode(UpdateAnnotationRequest, body);
	const all = list(videoId);
	const i = all.findIndex((a) => a.id === id);
	if (!b) return fail(422, 'ValidationError', 'Invalid request');
	if (i < 0) return fail(404, 'NotFound', 'Annotation not found');
	const cur = all[i]!;
	if (cur.version !== b.version) return fail(409, 'Conflict', 'Someone else changed this annotation. Reload to see the latest.');
	if (badRange(b.startMs ?? cur.startMs, b.endMs ?? cur.endMs)) return fail(422, 'ValidationError', 'Invalid request');
	const next = { ...cur, startMs: b.startMs ?? cur.startMs, endMs: b.endMs ?? cur.endMs, shape: b.shape ?? cur.shape, version: cur.version + 1, updatedAt: now() };
	all[i] = next;
	return json(next);
};

export const deleteAnnotation = (videoId: string, id: string, version: number | null) => {
	guard();
	const all = list(videoId);
	const i = all.findIndex((a) => a.id === id);
	if (i < 0) return fail(404, 'NotFound', 'Annotation not found');
	if (version !== null && all[i]!.version !== version) return fail(409, 'Conflict', 'Someone else changed this annotation. Reload to see the latest.');
	all.splice(i, 1);
	return json({ ok: true });
};

/** Dev hook: bump a row's version behind the UI's back, as a second coach session would. */
export const touch = (videoId: string) => {
	guard();
	const all = list(videoId);
	if (all[0]) all[0] = { ...all[0], version: all[0].version + 1 };
	return json({ ok: true });
};

export const reset = (videoId: string) => (guard(), rows.delete(videoId), json({ ok: true }));
