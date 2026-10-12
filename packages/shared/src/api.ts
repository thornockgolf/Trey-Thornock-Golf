import { Schema } from 'effect';

/** Stable error codes returned by the app API (spec section 5). */
export const ErrorCode = Schema.Literals([
	'NotAuthenticated',
	'Forbidden',
	'NotFound',
	'Conflict',
	'ValidationError',
	'PaymentError',
	'StorageError',
	'InternalError'
]);
export type ErrorCode = typeof ErrorCode.Type;

/** JSON body of every non-2xx API response. */
export const ErrorBody = Schema.Struct({ code: ErrorCode, message: Schema.String });
export type ErrorBody = typeof ErrorBody.Type;

export const Role = Schema.Literals(['player', 'coach']);
export type Role = typeof Role.Type;

export const CurrentUserSchema = Schema.Struct({ id: Schema.String, clerkUserId: Schema.String, role: Role });
export type CurrentUserData = typeof CurrentUserSchema.Type;
