import type { DatabaseError, QueueError } from '@ttg/db';
import { Schema } from 'effect';

/**
 * Tagged errors for the app server (spec "Cross-cutting Conventions"). Handlers fail with these;
 * `runRoute` maps them to an HTTP status and a stable `{ code, message }` body.
 */
export class NotAuthenticated extends Schema.TaggedError<NotAuthenticated>()('NotAuthenticated', {
	message: Schema.String
}) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()('Forbidden', {
	message: Schema.String
}) {}

export class NotFound extends Schema.TaggedError<NotFound>()('NotFound', {
	message: Schema.String
}) {}

export class Conflict extends Schema.TaggedError<Conflict>()('Conflict', {
	message: Schema.String
}) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()('ValidationError', {
	message: Schema.String
}) {}

export class StorageError extends Schema.TaggedError<StorageError>()('StorageError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect())
}) {}

export class PaymentError extends Schema.TaggedError<PaymentError>()('PaymentError', {
	message: Schema.String,
	/** Where the player can fix it; sent to the client as `billingUrl`. */
	billingUrl: Schema.optional(Schema.String),
	cause: Schema.optional(Schema.Defect())
}) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()('RateLimited', {
	message: Schema.String
}) {}

export type AppError =
	| NotAuthenticated
	| Forbidden
	| NotFound
	| Conflict
	| ValidationError
	| StorageError
	| PaymentError
	| RateLimited
	| DatabaseError
	| QueueError;
