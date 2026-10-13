import { HANDICAP_MAX, HANDICAP_MIN, MAX_PHOTO_BYTES, PHOTO_TYPES, type PhotoContentType, type ProfileDto, type UpdateProfileRequest } from '@ttg/shared';

/** The profile form as text fields, and the rules for turning it into a request. */
export interface ProfileForm {
	displayName: string;
	handicap: string;
	goals: string;
	homeCourse: string;
	hand: '' | 'left' | 'right';
	equipment: string;
	limitations: string;
}

export const formFrom = (p: ProfileDto): ProfileForm => ({
	displayName: p.displayName ?? '',
	handicap: p.handicap === null ? '' : String(p.handicap),
	goals: p.goals ?? '',
	homeCourse: p.homeCourse ?? '',
	hand: p.hand ?? '',
	equipment: p.equipment ?? '',
	limitations: p.limitations ?? ''
});

/** Handicaps are typed with a dot or a comma ("14,5"); returns null when blank, NaN when it is not a number. */
export const parseHandicap = (text: string): number | null => {
	const t = text.trim().replace(',', '.');
	if (t === '') return null;
	return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};

/** What is wrong with the form, field by field, in words; empty when it can be saved. */
export const formProblems = (f: ProfileForm): Partial<Record<keyof ProfileForm, string>> => {
	const out: Partial<Record<keyof ProfileForm, string>> = {};
	const h = parseHandicap(f.handicap);
	if (h !== null && (Number.isNaN(h) || h < HANDICAP_MIN || h > HANDICAP_MAX)) out.handicap = `Enter a handicap from ${HANDICAP_MIN} to ${HANDICAP_MAX}, or leave it blank.`;
	if (f.displayName.length > 80) out.displayName = 'Keep your name under 80 characters.';
	if (f.homeCourse.length > 120) out.homeCourse = 'Keep this under 120 characters.';
	for (const k of ['goals', 'equipment', 'limitations'] as const) if (f[k].length > 1000) out[k] = 'Keep this under 1,000 characters.';
	return out;
};

/** The request that saves the whole form (blank fields clear what was stored). */
export const toRequest = (f: ProfileForm): UpdateProfileRequest => ({
	displayName: f.displayName.trim() || null,
	handicap: parseHandicap(f.handicap),
	goals: f.goals.trim() || null,
	homeCourse: f.homeCourse.trim() || null,
	hand: f.hand === '' ? null : f.hand,
	equipment: f.equipment.trim() || null,
	limitations: f.limitations.trim() || null
});

/** Why a file cannot be a profile photo, or undefined when it can. */
export const photoProblem = (file: { type: string; size: number }): string | undefined => {
	if (!(file.type in PHOTO_TYPES)) return 'Choose a JPEG, PNG or WebP image.';
	if (file.size <= 0) return 'That file is empty.';
	if (file.size > MAX_PHOTO_BYTES) return `Choose an image under ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`;
	return undefined;
};

export const photoType = (file: { type: string }) => file.type as PhotoContentType;

export const initials = (p: Pick<ProfileDto, 'displayName' | 'email'>) => {
	const source = (p.displayName ?? p.email ?? '?').trim();
	const parts = source.split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
};
