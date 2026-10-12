import type { QuestionnaireValues, StoredAnswers } from '@ttg/shared';
import { Context, Effect, Layer } from 'effect';
import { Db } from './db';
import type { DatabaseError } from './errors';

export interface QuestionnaireResponse {
	readonly id: string;
	readonly userId: string;
	/** The player's attempt number: 1, then 2 after a retake. */
	readonly version: number;
	readonly formVersion: number;
	readonly values: QuestionnaireValues;
	/** Null while a draft. */
	readonly completedAt: Date | null;
	readonly updatedAt: Date;
}

interface Row {
	id: string;
	user_id: string;
	version: number;
	answers: Partial<StoredAnswers>;
	completed_at: Date | null;
	updated_at: Date;
}

const COLUMNS = 'id, user_id, version, answers, completed_at, updated_at';

const toResponse = (r: Row): QuestionnaireResponse => ({
	id: r.id,
	userId: r.user_id,
	version: r.version,
	formVersion: r.answers.formVersion ?? 1,
	values: r.answers.values ?? {},
	completedAt: r.completed_at,
	updatedAt: r.updated_at
});

export class Questionnaires extends Context.Service<
	Questionnaires,
	{
		/** The player's open draft, if any. */
		readonly getDraft: (userId: string) => Effect.Effect<QuestionnaireResponse | undefined, DatabaseError>;
		/** The player's most recent completed response, if any. */
		readonly getLatestCompleted: (userId: string) => Effect.Effect<QuestionnaireResponse | undefined, DatabaseError>;
		/**
		 * Save answers to the open draft (creating it as the next attempt number if none is open). With `complete`,
		 * the draft is stamped completed; the next save after that starts a new attempt and keeps the old one.
		 */
		readonly save: (input: {
			userId: string;
			formVersion: number;
			values: QuestionnaireValues;
			complete: boolean;
		}) => Effect.Effect<QuestionnaireResponse, DatabaseError>;
	}
>()('ttg/db/Questionnaires') {
	static readonly layer = Layer.effect(
		Questionnaires,
		Effect.gen(function* () {
			const db = yield* Db;
			return Questionnaires.of({
				getDraft: (userId) =>
					db
						.maybeOne<Row>(`select ${COLUMNS} from questionnaire_responses where user_id = $1 and completed_at is null`, [userId])
						.pipe(Effect.map((r) => (r ? toResponse(r) : undefined))),
				getLatestCompleted: (userId) =>
					db
						.maybeOne<Row>(
							`select ${COLUMNS} from questionnaire_responses where user_id = $1 and completed_at is not null order by version desc limit 1`,
							[userId]
						)
						.pipe(Effect.map((r) => (r ? toResponse(r) : undefined))),
				save: (i) =>
					db.transaction((tx) =>
						Effect.gen(function* () {
							const answers = JSON.stringify({ formVersion: i.formVersion, values: i.values } satisfies StoredAnswers);
							// Lock the user's row so two saves cannot both open a new attempt.
							yield* tx.query(`select id from users where id = $1 for update`, [i.userId]);
							const row = yield* tx.maybeOne<Row>(
								`update questionnaire_responses
								   set answers = $2::jsonb, completed_at = case when $3 then now() else null end
								 where user_id = $1 and completed_at is null returning ${COLUMNS}`,
								[i.userId, answers, i.complete]
							);
							if (row) return toResponse(row);
							const created = yield* tx.maybeOne<Row>(
								`insert into questionnaire_responses (user_id, version, answers, completed_at)
								 select $1, coalesce(max(version), 0) + 1, $2::jsonb, case when $3 then now() else null end
								 from questionnaire_responses where user_id = $1 returning ${COLUMNS}`,
								[i.userId, answers, i.complete]
							);
							return toResponse(created!);
						})
					)
			});
		})
	);
}
