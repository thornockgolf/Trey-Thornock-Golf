/** Dev-only in-memory stand-in for `/api/analyses` and the overlay endpoints. Uses the real request schemas. Lost on restart. */
import { dev } from '$app/env';
import { error, json } from '@sveltejs/kit';
import { CreateAnalysisRequest, DEFAULT_OVERLAY, OverlaySettings, type AnalysisDto } from '@ttg/shared';
import { Schema } from 'effect';

interface Row {
	dto: AnalysisDto;
	settings: OverlaySettings;
}
const rows = new Map<string, Row>();
const fail = (status: number, code: string, message: string) => json({ code, message }, { status });
const guard = () => {
	if (!dev) error(404, 'Not found');
};

export const createAnalysis = (body: unknown) => {
	guard();
	let b: CreateAnalysisRequest;
	try {
		b = Schema.decodeUnknownSync(CreateAnalysisRequest)(body);
	} catch {
		return fail(422, 'ValidationError', 'Invalid request');
	}
	const dto: AnalysisDto = { id: crypto.randomUUID(), videoId: b.videoId, coachId: 'coach', title: b.title ?? null, createdAt: new Date().toISOString() };
	rows.set(dto.id, { dto, settings: { ...DEFAULT_OVERLAY } });
	return json(dto);
};

export const getOverlay = (id: string) => {
	guard();
	const r = rows.get(id);
	return r ? json({ analysisId: id, videoId: r.dto.videoId, settings: r.settings }) : fail(404, 'NotFound', 'Analysis not found');
};

export const putOverlay = (id: string, body: unknown) => {
	guard();
	const r = rows.get(id);
	if (!r) return fail(404, 'NotFound', 'Analysis not found');
	try {
		r.settings = Schema.decodeUnknownSync(OverlaySettings)(body);
	} catch {
		return fail(422, 'ValidationError', 'Invalid request');
	}
	return json({ analysisId: id, videoId: r.dto.videoId, settings: r.settings });
};
