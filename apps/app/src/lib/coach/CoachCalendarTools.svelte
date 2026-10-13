<script lang="ts">
	import type { AssessmentDto, AssessmentResultDto, CalendarData, CheckInDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { localDate } from '#lib/plans/sessions';
	import { ApiError, apiClient } from './coach-client';

	interface Props {
		playerId: string;
		calendar: CalendarData;
		assessments: readonly AssessmentDto[];
		apiBase?: string;
		onCalendar: (c: CalendarData) => void;
		onAssessments: (a: AssessmentDto[]) => void;
	}
	let { playerId, calendar, assessments, apiBase = '/api', onCalendar, onAssessments }: Props = $props();

	const api = $derived(apiClient(apiBase));
	let today = $state('');
	$effect(() => {
		today = localDate();
		if (!ciDate) ciDate = today;
		if (!testDate) testDate = today;
	});

	let ciDate = $state('');
	let repeat = $state(0);
	let testId = $state('');
	let testDate = $state('');
	let newName = $state('');
	let newUnit = $state('');
	let values = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);

	const fail = (e: unknown, fallback: string) => (error = e instanceof ApiError ? e.message : fallback);
	const pending = $derived(calendar.results.filter((r) => r.value === null));
	const unitOf = (id: string) => assessments.find((a) => a.id === id)?.unit ?? null;

	const scheduleCheckIn = async () => {
		busy = 'checkin';
		error = null;
		try {
			const r = await api.call<{ checkIns: CheckInDto[] }>('POST', '/check-ins', { playerId, scheduledOn: ciDate, repeatWeeks: repeat });
			onCalendar({ ...calendar, checkIns: [...calendar.checkIns, ...r.checkIns] });
			toaster.success({ title: r.checkIns.length === 1 ? 'Check-in scheduled' : `${r.checkIns.length} check-ins scheduled` });
		} catch (e) {
			fail(e, 'Could not schedule the check-in.');
		} finally {
			busy = null;
		}
	};

	const createTest = async () => {
		busy = 'new-test';
		error = null;
		try {
			const a = await api.call<AssessmentDto>('POST', '/assessments', { name: newName, ...(newUnit.trim() ? { unit: newUnit } : {}) });
			onAssessments([...assessments, a].sort((x, y) => x.name.localeCompare(y.name)));
			testId = a.id;
			newName = '';
			newUnit = '';
		} catch (e) {
			fail(e, 'Could not create the test.');
		} finally {
			busy = null;
		}
	};

	const scheduleTest = async () => {
		busy = 'schedule';
		error = null;
		try {
			const r = await api.call<AssessmentResultDto>('POST', `/assessments/${testId}/schedule`, { playerId, scheduledOn: testDate });
			onCalendar({ ...calendar, results: [...calendar.results, r] });
			toaster.success({ title: 'Test scheduled' });
		} catch (e) {
			fail(e, 'Could not schedule the test.');
		} finally {
			busy = null;
		}
	};

	const record = async (r: AssessmentResultDto) => {
		const value = Number(values[r.id]);
		if (!Number.isFinite(value) || values[r.id] === undefined || values[r.id] === '') {
			error = 'Enter the result as a number.';
			return;
		}
		busy = r.id;
		error = null;
		try {
			const saved = await api.call<AssessmentResultDto>('POST', `/assessments/${r.assessmentId}/results`, { playerId, value, resultId: r.id });
			onCalendar({ ...calendar, results: calendar.results.map((x) => (x.id === r.id ? saved : x)) });
			toaster.success({ title: 'Result recorded', description: 'The player has been told.' });
		} catch (e) {
			fail(e, 'Could not record the result.');
		} finally {
			busy = null;
		}
	};
</script>

<div class="flex flex-col gap-5" data-coach-tools>
	{#if error}<p class="rounded-container border border-error-500 p-3" role="alert">{error}</p>{/if}

	<section class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-labelledby="ci-h">
		<h3 id="ci-h" class="h5">Schedule a check-in</h3>
		<div class="flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Day</span><input class="input min-h-11" type="date" bind:value={ciDate} data-ci-date /></label>
			<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Repeat weekly for</span>
				<select class="select min-h-11" bind:value={repeat} data-ci-repeat>
					<option value={0}>Just once</option>
					{#each [1, 2, 3, 4, 6, 8, 12] as n (n)}<option value={n}>{n} more week{n === 1 ? '' : 's'}</option>{/each}
				</select>
			</label>
			<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={busy === 'checkin' || !ciDate} onclick={scheduleCheckIn} data-ci-schedule>Schedule</button>
		</div>
	</section>

	<section class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-labelledby="t-h">
		<h3 id="t-h" class="h5">Tests</h3>
		<div class="flex flex-wrap items-end gap-3">
			<label class="flex min-w-0 flex-1 flex-col gap-1"><span class="text-sm font-semibold">Test</span>
				<select class="select min-h-11" bind:value={testId} data-test-select>
					<option value="">Choose a test</option>
					{#each assessments as a (a.id)}<option value={a.id}>{a.name}{a.unit ? ` (${a.unit})` : ''}</option>{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Day</span><input class="input min-h-11" type="date" bind:value={testDate} data-test-date /></label>
			<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={busy === 'schedule' || !testId || !testDate} onclick={scheduleTest} data-test-schedule>Schedule</button>
		</div>
		<details>
			<summary class="min-h-11 cursor-pointer py-2 text-sm font-semibold">Add a new kind of test</summary>
			<div class="flex flex-wrap items-end gap-3 pt-2">
				<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Name</span><input class="input min-h-11" maxlength="80" bind:value={newName} placeholder="e.g. 7 iron carry" data-test-name /></label>
				<label class="flex flex-col gap-1"><span class="text-sm font-semibold">Unit</span><input class="input min-h-11 w-24" maxlength="20" bind:value={newUnit} placeholder="yd" /></label>
				<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy === 'new-test' || !newName.trim()} onclick={createTest} data-test-create>Add test</button>
			</div>
		</details>

		{#if pending.length > 0}
			<h4 class="mt-2 font-display font-semibold">Waiting for a result</h4>
			<ul class="flex flex-col gap-2">
				{#each pending as r (r.id)}
					<li class="flex flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2" data-pending-result>
						<span class="min-w-0 flex-1"><span class="font-medium break-words">{r.name}</span> <span class="text-sm text-surface-600-400">on {r.date}</span></span>
						<label class="flex items-center gap-1 text-sm"><span class="sr-only">Result for {r.name}</span>
							<input class="input min-h-11 w-28 tabular-nums" type="number" step="any" bind:value={values[r.id]} data-result-value />{unitOf(r.assessmentId) ?? ''}
						</label>
						<button type="button" class="btn min-h-11 preset-filled-tertiary-500" disabled={busy === r.id} onclick={() => record(r)} data-record-result>Record</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
