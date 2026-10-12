import { Schema } from 'effect';

/** Any failure talking to Postgres. The cause is for logs only; never send it to clients. */
export class DatabaseError extends Schema.TaggedError<DatabaseError>()('DatabaseError', {
	message: Schema.String,
	cause: Schema.optional(Schema.Defect())
}) {}
