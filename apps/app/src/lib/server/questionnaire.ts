import { Questionnaires, type QuestionnaireResponse } from '@ttg/db';
import {
	QUESTIONNAIRE_FORM_VERSION,
	QUESTIONNAIRE_SECTIONS,
	SaveQuestionnaireRequest,
	questionLabel,
	validateAnswers,
	type QuestionnaireResponseDto
} from '@ttg/shared';
import { Effect } from 'effect';
import { requireRole } from './auth';
import { decodeBody } from './decode';
import { requireAssessment } from './entitlements';
import { ValidationError } from './errors';

export const toQuestionnaireDto = (r: QuestionnaireResponse): QuestionnaireResponseDto => ({
	id: r.id,
	userId: r.userId,
	version: r.version,
	formVersion: r.formVersion,
	answers: r.values,
	completedAt: r.completedAt?.toISOString() ?? null,
	updatedAt: r.updatedAt.toISOString()
});

/** `GET /api/questionnaire`: the form, the player's open draft (to resume), and their latest completed response. */
export const getQuestionnaire = Effect.gen(function* () {
	const player = yield* requireRole('player');
	const questionnaires = yield* Questionnaires;
	const [draft, latest] = yield* Effect.all([questionnaires.getDraft(player.id), questionnaires.getLatestCompleted(player.id)]);
	return {
		formVersion: QUESTIONNAIRE_FORM_VERSION,
		sections: QUESTIONNAIRE_SECTIONS,
		draft: draft ? toQuestionnaireDto(draft) : null,
		latest: latest ? toQuestionnaireDto(latest) : null
	};
});

/**
 * `POST /api/questionnaire`: save a draft, or submit it (`submit: true`). A submit with a required question missing
 * saves nothing and names the question(s) (422). The first save after a completed response starts a new attempt;
 * the earlier one is kept.
 */
export const saveQuestionnaire = Effect.gen(function* () {
	const player = yield* requireRole('player');
	yield* requireAssessment(player);
	const body = yield* decodeBody(SaveQuestionnaireRequest);
	const { values, issues } = validateAnswers(body.answers, { complete: body.submit });
	if (issues.length > 0) {
		const named = issues.map((i) => `"${questionLabel(i.questionId)}"`).join(', ');
		return yield* new ValidationError({ message: `Check these questions: ${named}` });
	}
	const saved = yield* (yield* Questionnaires).save({
		userId: player.id,
		formVersion: QUESTIONNAIRE_FORM_VERSION,
		values,
		complete: body.submit
	});
	return toQuestionnaireDto(saved);
});
