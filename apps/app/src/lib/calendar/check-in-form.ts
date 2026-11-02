/** Pure helper for the check-in form's "rounds played" field. */
export const MAX_ROUNDS = 30;

/** Blank is 0; a whole number from 0 to `MAX_ROUNDS` is that number; anything else is invalid. Accepts any value, as a bound input may hold a number or null. */
export const parseRounds = (value: string | number | null | undefined): number | 'invalid' => {
	if (value === null || value === undefined) return 0;
	if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= MAX_ROUNDS ? value : 'invalid';
	if (typeof value !== 'string') return 'invalid';
	const t = value.trim();
	if (t === '') return 0;
	if (!/^\d+$/.test(t)) return 'invalid';
	const n = Number(t);
	return n <= MAX_ROUNDS ? n : 'invalid';
};
