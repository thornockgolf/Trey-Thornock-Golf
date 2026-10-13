import type {
	AssignPlanRequest,
	CoachNoteDto,
	CreateDrillRequest,
	CreatePlanRequest,
	DrillDto,
	PlanAssignmentDto,
	PlanDto,
	PlayerSummaryDto,
	UpdateDrillRequest,
	UpdatePlanRequest
} from '@ttg/shared';

type Fetch = typeof fetch;

/** A failed call; `message` is what the server said (already written for people). */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

const headers = { 'content-type': 'application/json', accept: 'application/json' };

/** JSON in, JSON out, errors as `ApiError`. `base` is `/api` (or a dev mock). */
export const apiClient = (base = '/api', f: Fetch = (...a) => fetch(...a)) => {
	const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
		const res = await f(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
		if (res.ok) return (await res.json()) as T;
		let message = 'Something went wrong';
		try {
			message = ((await res.json()) as { message?: string }).message ?? message;
		} catch {
			// not JSON
		}
		throw new ApiError(res.status, message);
	};
	return {
		call,
		drills: {
			list: async () => (await call<{ drills: DrillDto[] }>('GET', '/drills')).drills,
			create: (b: CreateDrillRequest) => call<DrillDto>('POST', '/drills', b),
			update: (id: string, b: UpdateDrillRequest) => call<DrillDto>('PATCH', `/drills/${id}`, b)
		},
		plans: {
			list: async () => (await call<{ plans: PlanDto[] }>('GET', '/plans')).plans,
			create: (b: CreatePlanRequest) => call<PlanDto>('POST', '/plans', b),
			update: (id: string, b: UpdatePlanRequest) => call<PlanDto>('PATCH', `/plans/${id}`, b),
			assign: (id: string, b: AssignPlanRequest) => call<PlanAssignmentDto>('POST', `/plans/${id}/assign`, b)
		},
		players: {
			list: async () => (await call<{ players: PlayerSummaryDto[] }>('GET', '/players')).players,
			assign: (id: string) => call<{ ok: true }>('POST', `/players/${id}/assign`),
			unassign: (id: string) => call<{ ok: true }>('POST', `/players/${id}/unassign`),
			/** Permanent: removes the player's account, videos and history. Payment records are kept. */
			delete: (id: string) => call<{ ok: true }>('POST', `/players/${id}/delete`, { confirm: true }),
			notes: async (id: string) => (await call<{ notes: CoachNoteDto[] }>('GET', `/players/${id}/notes`)).notes,
			addNote: (id: string, body: string) => call<CoachNoteDto>('POST', `/players/${id}/notes`, { body })
		}
	};
};
