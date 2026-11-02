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

/** The longest side a stored profile photo needs (it shows at 96 px). */
export const PHOTO_MAX_SIDE = 1024;

/**
 * Shrink a picked image to a JPEG no wider than PHOTO_MAX_SIDE. Phone photos are big, and some (HEIC) are not an
 * accepted type; drawing them on a canvas fixes both. Returns the original file when the browser cannot decode it.
 */
export const shrinkPhoto = async (file: File): Promise<File> => {
	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close?.();
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
		return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
	} catch {
		return file;
	}
};

/**
 * What to tell the player when the storage PUT fails. A `fetch` that throws (a TypeError) never got an answer:
 * that is a network drop or the storage bucket's CORS rejecting this site's origin.
 */
export const putFailureMessage = (err: unknown, origin: string): string =>
	err instanceof TypeError
		? `The photo could not reach storage from ${origin} (network problem, or storage does not allow this address yet). Try again, or tell Trey.`
		: 'The upload did not go through. Try again.';

export const photoType =(file: { type: string }) => file.type as PhotoContentType;

export const initials = (p: Pick<ProfileDto, 'displayName' | 'email'>) => {
	const source = (p.displayName ?? p.email ?? '?').trim();
	const parts = source.split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)![0] ?? '') : '')).toUpperCase();
};
