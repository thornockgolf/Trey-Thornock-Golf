import { describe, expect, it } from 'vitest';
import { logHref, parseDateParam, safeReturnTo, blankForm, earliestDate, formFromLogged, formProblem, parseMinutes, toCreateRequest, toUpdateRequest, toggleTag, videoStateLabel } from './log-form';

const today = '2026-11-02';
const filled = { ...blankForm(today), tags: ['skill' as const] };

describe('toggleTag', () => {
	it('adds and removes, always in the canonical order', () => {
		expect(toggleTag([], 'situational')).toEqual(['situational']);
		expect(toggleTag(['situational'], 'mechanical')).toEqual(['mechanical', 'situational']);
		expect(toggleTag(['mechanical', 'skill', 'situational'], 'skill')).toEqual(['mechanical', 'situational']);
	});
});

describe('formProblem', () => {
	it('accepts a tag alone, or text alone', () => {
		expect(formProblem(filled, today)).toBeNull();
		expect(formProblem({ ...blankForm(today), workedOn: 'Chipping' }, today)).toBeNull();
		expect(formProblem({ ...blankForm(today), notes: 'Felt rushed' }, today)).toBeNull();
	});
	it('rejects an empty log with a clear message', () => {
		expect(formProblem(blankForm(today), today)).toMatch(/Pick at least one of Mechanical technique, Skill or Situational practice/);
		expect(formProblem({ ...blankForm(today), workedOn: '   ' }, today)).not.toBeNull();
	});
	it('rejects future and too-old dates, bad minutes and long text', () => {
		expect(formProblem({ ...filled, date: '2026-11-03' }, today)).toMatch(/future/);
		expect(formProblem({ ...filled, date: '2025-01-01' }, today)).toMatch(/too far back/);
		expect(formProblem({ ...filled, date: earliestDate(today) }, today)).toBeNull();
		expect(formProblem({ ...filled, date: '' }, today)).toMatch(/Pick the day/);
		expect(formProblem({ ...filled, minutes: '0' }, today)).toMatch(/whole number/);
		expect(formProblem({ ...filled, minutes: '4.5' }, today)).toMatch(/whole number/);
		expect(formProblem({ ...filled, notes: 'x'.repeat(2001) }, today)).toMatch(/2000/);
		expect(formProblem({ ...filled, workedOn: 'x'.repeat(501) }, today)).toMatch(/500/);
	});
});

describe('parseMinutes', () => {
	it('reads blank, numbers and junk', () => {
		expect(parseMinutes('')).toBeNull();
		expect(parseMinutes(' 45 ')).toBe(45);
		expect(parseMinutes('601')).toBe('invalid');
		expect(parseMinutes('abc')).toBe('invalid');
	});
});

describe('parseMinutes with every value a bound input can hold', () => {
	it.each<[string | number | null | undefined, number | null | 'invalid']>([
		[undefined, null], [null, null], ['', null], ['  ', null],
		['45', 45], [45, 45], [1, 1], [600, 600], ['600', 600],
		['45.5', 'invalid'], [45.5, 'invalid'], [0, 'invalid'], ['0', 'invalid'], [-3, 'invalid'], ['-3', 'invalid'],
		[601, 'invalid'], ['601', 'invalid'], [NaN, 'invalid'], ['abc', 'invalid']
	])('%j -> %j', (input, want) => {
		expect(parseMinutes(input)).toEqual(want);
	});

	it('formProblem and the requests never throw on a number, null or undefined', () => {
		expect(formProblem({ ...filled, minutes: 45 }, today)).toBeNull();
		expect(formProblem({ ...filled, minutes: null }, today)).toBeNull();
		expect(formProblem({ ...filled, minutes: undefined }, today)).toBeNull();
		expect(formProblem({ ...filled, minutes: 700 }, today)).toMatch(/whole number/);
		expect(formProblem({ ...filled, minutes: 0 }, today)).toMatch(/whole number/);
		expect(toCreateRequest({ ...filled, minutes: 45 }).minutes).toBe(45);
		expect(toCreateRequest({ ...filled, minutes: null })).not.toHaveProperty('minutes');
		expect(toUpdateRequest({ ...filled, minutes: 45 }).minutes).toBe(45);
		expect(toUpdateRequest({ ...filled, minutes: undefined }).minutes).toBeNull();
	});
});

describe('requests', () => {
	it('create leaves out what was not filled in', () => {
		expect(toCreateRequest(filled)).toEqual({ date: today, tags: ['skill'] });
		expect(toCreateRequest({ ...filled, minutes: '30', workedOn: ' Wedges ', notes: ' ok ', drillIds: ['d1'], videoId: 'v1' })).toEqual({
			date: today, tags: ['skill'], minutes: 30, workedOn: 'Wedges', drillIds: ['d1'], notes: 'ok', videoId: 'v1'
		});
	});
	it('update sends nulls so cleared fields are cleared', () => {
		expect(toUpdateRequest(filled)).toEqual({ date: today, tags: ['skill'], minutes: null, workedOn: null, drillIds: [], notes: null, videoId: null });
	});
	it('round-trips a stored log into the form', () => {
		const form = formFromLogged({
			id: 'l', playerId: 'p', date: today, tags: ['mechanical'], minutes: 20, workedOn: 'Grip', drills: [{ id: 'd1', name: 'Gate' }], notes: null,
			video: { id: 'v', status: 'processing', title: null }, createdAt: ''
		});
		expect(form).toEqual({ date: today, tags: ['mechanical'], minutes: '20', workedOn: 'Grip', drillIds: ['d1'], notes: '', videoId: 'v' });
	});
});

describe('videoStateLabel', () => {
	it('says processing for every state before ready', () => {
		expect(videoStateLabel('processing')).toMatch(/processing/);
		expect(videoStateLabel('pending')).toMatch(/processing/);
		expect(videoStateLabel('ready')).toBe('Ready to watch');
		expect(videoStateLabel('failed')).toMatch(/Could not/);
	});
});

describe('parseDateParam', () => {
	it('takes a valid day from today back to the limit', () => {
		expect(parseDateParam('2026-11-02', today)).toBe('2026-11-02');
		expect(parseDateParam('2026-10-20', today)).toBe('2026-10-20');
		expect(parseDateParam(earliestDate(today), today)).toBe(earliestDate(today));
	});
	it('ignores the future, too far back, impossible days and junk', () => {
		for (const v of ['2026-11-03', '2020-01-01', '2026-02-30', '2026-1-5', 'tomorrow', '', null, undefined, '2026-11-02T00:00:00Z']) {
			expect(parseDateParam(v, today)).toBe(today);
		}
		expect(parseDateParam(addOne(earliestDate(today), -1), today)).toBe(today);
	});
});

function addOne(day: string, n: number) {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

describe('safeReturnTo', () => {
	it('allows only the listed internal paths', () => {
		expect(safeReturnTo('/calendar')).toBe('/calendar');
		expect(safeReturnTo('/plans')).toBe('/plans');
		expect(safeReturnTo('/')).toBe('/');
	});
	it('falls back for anything else, including open redirects', () => {
		for (const v of ['https://evil.example', '//evil.example', '/\\evil.example', '/calendar/../x', '/calendar?x=1', '/coach', 'calendar', '', null, undefined]) {
			expect(safeReturnTo(v)).toBe('/plans');
		}
		expect(safeReturnTo('//x', '/calendar')).toBe('/calendar');
	});
});

describe('logHref', () => {
	it('builds the link with optional day and way back', () => {
		expect(logHref()).toBe('/sessions/new');
		expect(logHref({ date: '2026-11-01', returnTo: '/calendar' })).toBe('/sessions/new?date=2026-11-01&returnTo=%2Fcalendar');
	});
});
