import type { ErrorBody } from '@ttg/shared';
import type { AppError } from './errors';

const STATUS: Record<AppError['_tag'], number> = {
	NotAuthenticated: 401,
	Forbidden: 403,
	NotFound: 404,
	Conflict: 409,
	ValidationError: 422,
	PaymentError: 402,
	StorageError: 500,
	DatabaseError: 500
};

export const isAppError = (u: unknown): u is AppError =>
	typeof u === 'object' && u !== null && '_tag' in u && typeof u._tag === 'string' && u._tag in STATUS;

/** Map a tagged error to `{ status, body }`. Storage errors never expose their cause. */
export const toHttpError = (e: AppError): { status: number; body: ErrorBody } => ({
	status: STATUS[e._tag],
	body: {
		code: e._tag === 'DatabaseError' ? 'InternalError' : e._tag,
		message: e._tag === 'StorageError' ? 'Storage operation failed' : e._tag === 'DatabaseError' ? 'Something went wrong' : e.message
	}
});

export const INTERNAL_ERROR = {
	status: 500,
	body: { code: 'InternalError', message: 'Something went wrong' } satisfies ErrorBody
};
