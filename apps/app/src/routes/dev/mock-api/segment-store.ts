/**
 * Dev-only stand-in for the analysis recording endpoints, so the recorder can be driven in a browser without Clerk,
 * R2 or the worker. The browser's real MediaRecorder bytes are PUT here, "processed" by ffmpeg into seekable MP4/AAC
 * (what the real worker does) and played back from the manifest. Uses the real request schema and timeline rules.
 * In memory (and temp files); lost on restart.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import {
	CreateSegmentRequest,
	MAX_SEGMENT_MS,
	MIN_SEGMENT_MS,
	planReplace,
	type AnnotationDto,
	type ManifestResponse,
	type SegmentDto
} from '@ttg/shared';
import { Schema } from 'effect';
import { countStartingIn, removeStartingIn, restore } from './annotation-store';
import { videoOf } from './analysis-store';
import { CLIP_SECONDS } from './media';

interface Row {
	id: string;
	analysisId: string;
	startMs: number;
	endMs: number;
	clipStartMs: number;
	clipId: string | null;
	hasVideo: boolean;
	status: SegmentDto['status'];
	errorCode: string | null;
	contentType: string;
	annotations: 'keep' | 'remove';
	createdAt: string;
}
interface Op {
	/** The live list before this operation. */
	before: Row[];
	removed: AnnotationDto[];
	videoId: string;
}

const rows = new Map<string, Row>();
const live = new Map<string, Row[]>(); // analysis -> live segments
const ops = new Map<string, Op[]>();
const bytes = new Map<string, { data: Buffer; type: string }>();
const clipFiles = new Map<string, string>();
const dir = join(tmpdir(), 'ttg-dev-recordings');
const DURATION = CLIP_SECONDS * 1000;

const guard = () => {
	if (!dev) error(404, 'Not found');
};
const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const dto = (r: Row): SegmentDto => ({ id: r.id, startMs: r.startMs, endMs: r.endMs, status: r.status, errorCode: r.errorCode, createdAt: r.createdAt });
const liveOf = (analysisId: string) => (live.get(analysisId) ?? []).slice().sort((a, b) => a.startMs - b.startMs);

export const clipFile = (clipId: string) => clipFiles.get(clipId);

export const listSegments = (analysisId: string, q: URLSearchParams) => {
	guard();
	const a = q.get('startMs');
	const b = q.get('endMs');
	const videoId = videoOf(analysisId);
	return json({
		segments: liveOf(analysisId).map(dto),
		annotationsInRange: a !== null && b !== null && videoId ? countStartingIn(videoId, Number(a), Number(b)) : null
	});
};

export const createSegment = (analysisId: string, body: unknown) => {
	guard();
	let b: CreateSegmentRequest;
	try {
		b = Schema.decodeUnknownSync(CreateSegmentRequest)(body);
	} catch {
		return fail(422, 'ValidationError', 'Invalid request');
	}
	const len = b.endMs - b.startMs;
	if (len < MIN_SEGMENT_MS || len > MAX_SEGMENT_MS || b.endMs > DURATION) return fail(422, 'ValidationError', 'Invalid request: check startMs, endMs');
	const id = crypto.randomUUID();
	const row: Row = {
		id, analysisId, startMs: b.startMs, endMs: b.endMs, clipStartMs: 0, clipId: null, hasVideo: b.contentType.startsWith('video/'),
		status: 'pending', errorCode: null, contentType: b.contentType, annotations: b.annotations ?? 'keep', createdAt: new Date().toISOString()
	};
	rows.set(id, row);
	const videoId = videoOf(analysisId);
	return json({
		segment: dto(row),
		upload: { url: `/dev/mock-api/recordings/${id}`, headers: { 'Content-Type': b.contentType }, expiresAt: new Date(Date.now() + 900_000).toISOString() },
		annotationsInRange: videoId ? countStartingIn(videoId, b.startMs, b.endMs) : 0
	});
};

export const putRecording = (segmentId: string, data: Buffer, type: string) => {
	guard();
	if (!rows.has(segmentId)) return fail(404, 'NotFound', 'Segment not found');
	bytes.set(segmentId, { data, type });
	return new Response(null, { status: 200, headers: { etag: '"mock"' } });
};

const ffmpeg = (args: string[]) =>
	new Promise<void>((resolve, reject) => {
		const p = spawn('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args]);
		let err = '';
		p.stderr.on('data', (d) => (err += d));
		p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err))));
	});

/** What the worker does: normalize to MP4/AAC at the slot's length, then commit (replace overlapping segments). */
const process = async (row: Row) => {
	row.status = 'processing';
	try {
		mkdirSync(dir, { recursive: true });
		const raw = bytes.get(row.id);
		if (!raw) throw new Error('no recording');
		const src = join(dir, `${row.id}.raw`);
		const out = join(dir, `${row.id}.mp4`);
		writeFileSync(src, raw.data);
		const seconds = ((row.endMs - row.startMs) / 1000).toFixed(3);
		await ffmpeg([
			'-fflags', '+genpts', '-i', src,
			...(row.hasVideo ? ['-map', '0:v:0', '-vf', 'fps=30,tpad=stop_mode=clone:stop_duration=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'] : ['-vn']),
			'-map', '0:a:0', '-af', 'aresample=async=1000:first_pts=0,apad', '-c:a', 'aac', '-ar', '48000', '-ac', '1',
			'-t', seconds, '-movflags', '+faststart', out
		]);
		clipFiles.set(row.id, out);
		row.clipId = row.id;
		// commit
		const current = liveOf(row.analysisId);
		const plan = planReplace(current.map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, clipStartMs: s.clipStartMs })), row.startMs, row.endMs);
		const videoId = videoOf(row.analysisId)!;
		const removed = row.annotations === 'remove' ? removeStartingIn(videoId, row.startMs, row.endMs) : [];
		const history = ops.get(row.analysisId) ?? [];
		history.push({ before: current.map((s) => ({ ...s })), removed, videoId });
		ops.set(row.analysisId, history);
		const next = current.filter((s) => !plan.replaced.includes(s.id));
		for (const t of plan.trims) {
			const from = current.find((s) => s.id === t.from)!;
			next.push({ ...from, id: crypto.randomUUID(), startMs: t.startMs, endMs: t.endMs, clipStartMs: t.clipStartMs });
		}
		row.status = 'ready';
		next.push(row);
		live.set(row.analysisId, next);
	} catch (e) {
		row.status = 'failed';
		row.errorCode = 'TRANSCODE_FAILED';
		console.error('mock segment processing failed:', e instanceof Error ? e.message : e);
	}
};

export const completeSegment = (analysisId: string, segmentId: string) => {
	guard();
	const row = rows.get(segmentId);
	if (!row || row.analysisId !== analysisId) return fail(404, 'NotFound', 'Segment not found');
	if (!bytes.has(segmentId)) return fail(409, 'Conflict', 'The upload has not finished. Try again.');
	if (row.status === 'pending') {
		row.status = 'uploaded';
		setTimeout(() => void process(row), 1200); // the queue and the worker take a moment
	}
	return json(dto(row));
};

export const getSegment = (analysisId: string, segmentId: string) => {
	guard();
	const row = rows.get(segmentId);
	return row && row.analysisId === analysisId ? json(dto(row)) : fail(404, 'NotFound', 'Segment not found');
};

export const undoSegments = (analysisId: string) => {
	guard();
	const history = ops.get(analysisId) ?? [];
	const op = history.pop();
	if (!op) return fail(409, 'Conflict', 'There is nothing to undo');
	live.set(analysisId, op.before);
	restore(op.videoId, op.removed);
	return json({ restored: op.before.length, restoredAnnotations: op.removed.length });
};

export const manifest = (analysisId: string) => {
	guard();
	const videoId = videoOf(analysisId);
	if (!videoId) return fail(404, 'NotFound', 'Analysis not found');
	const body: ManifestResponse = {
		analysisId,
		videoId,
		segments: liveOf(analysisId).map((s) => ({ id: s.id, startMs: s.startMs, endMs: s.endMs, clipStartMs: s.clipStartMs, hasVideo: s.hasVideo, url: `/dev/mock-api/clips/${s.clipId}` })),
		expiresAt: new Date(Date.now() + 3_600_000).toISOString()
	};
	return json(body);
};
