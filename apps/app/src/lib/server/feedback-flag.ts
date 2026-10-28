/** TEMPORARY dev tool (docs/system/feedback.md): the env flag, read where `$app/*` is available. */
import { dev } from '$app/env';
import { PUBLIC_FEEDBACK_ENABLED } from '$app/env/public';
import { Effect } from 'effect';
import { isFeedbackEnabled } from '#lib/feedback/flag';
import { NotFound } from './errors';

export const feedbackEnabled = isFeedbackEnabled(PUBLIC_FEEDBACK_ENABLED, dev);

/** Wrap a feedback handler: with the flag off every endpoint answers 404, as if the routes did not exist. */
export const gated = <A, E, R>(handler: Effect.Effect<A, E, R>) =>
	feedbackEnabled ? handler : Effect.fail(new NotFound({ message: 'Not found' }));
