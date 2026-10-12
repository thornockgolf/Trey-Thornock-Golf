<script lang="ts">
	import type { AnswerValue, QuestionSection, QuestionnaireResponseDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { cleanForSave, firstInvalidStep, stepIssues, toggleValue } from './steps';

	/** `initial` seeds the answers (a saved draft, or the last response on a retake). `onDone` gets the saved response. */
	let {
		sections,
		initial,
		onDone
	}: {
		sections: readonly QuestionSection[];
		initial: Readonly<Record<string, AnswerValue>>;
		onDone: (saved: QuestionnaireResponseDto) => void;
	} = $props();

	// `initial` only seeds the form; the page re-mounts the stepper (`{#key}`) when it changes.
	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, AnswerValue | undefined>>({ ...initial });
	let step = $state(0);
	let errors = $state<Record<string, string>>({});
	let busy = $state(false);

	const section = $derived(sections[step]!);
	const last = $derived(step === sections.length - 1);

	const post = async (submit: boolean) => {
		const res = await fetch('/api/questionnaire', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ answers: cleanForSave(values), submit })
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			throw new Error(body?.message ?? 'Could not save. Try again.');
		}
		return (await res.json()) as QuestionnaireResponseDto;
	};

	/** Validate this step, save the draft so the player can resume, then move on (or submit on the last step). */
	const next = async () => {
		const issues = stepIssues(section, cleanForSave(values));
		errors = Object.fromEntries(issues.map((i) => [i.questionId, i.message]));
		if (issues.length > 0) return;
		busy = true;
		try {
			if (last) {
				const bad = firstInvalidStep(cleanForSave(values), sections);
				if (bad >= 0) {
					step = bad;
					errors = Object.fromEntries(stepIssues(sections[bad]!, cleanForSave(values)).map((i) => [i.questionId, i.message]));
					return;
				}
				onDone(await post(true));
			} else {
				await post(false);
				step += 1;
			}
		} catch (e) {
			toaster.error({ title: e instanceof Error ? e.message : 'Could not save. Try again.' });
		} finally {
			busy = false;
		}
	};

	const back = () => {
		errors = {};
		step -= 1;
	};
</script>

<section class="card surface-raised border border-surface-200-800 rounded-container p-5 md:p-7" aria-labelledby="q-heading">
	<p class="eyebrow">Step {step + 1} of {sections.length}</p>
	<h2 id="q-heading" class="h2 mb-1">{section.title}</h2>
	<progress class="progress mb-5 w-full" value={step + 1} max={sections.length} aria-label="Progress"></progress>

	<form
		class="flex flex-col gap-6"
		novalidate
		onsubmit={(e) => {
			e.preventDefault();
			void next();
		}}
	>
		{#each section.questions as q (q.id)}
			<fieldset class="flex flex-col gap-2" aria-describedby={errors[q.id] ? `${q.id}-error` : undefined}>
				<legend class="font-display font-semibold text-surface-700-300">
					{q.label}{#if !q.required}<span class="font-body font-normal text-surface-600-400"> (optional)</span>{/if}
				</legend>
				{#if q.help}<p class="text-sm text-surface-600-400">{q.help}</p>{/if}

				{#if q.type === 'single'}
					<div class="flex flex-col gap-1">
						{#each q.options as o (o.value)}
							<label class="flex min-h-12 items-center gap-3">
								<input class="radio" type="radio" name={q.id} value={o.value} checked={values[q.id] === o.value} onchange={() => (values[q.id] = o.value)} />
								<span>{o.label}</span>
							</label>
						{/each}
					</div>
				{:else if q.type === 'multi'}
					<div class="flex flex-col gap-1">
						{#each q.options as o (o.value)}
							<label class="flex min-h-12 items-center gap-3">
								<input
									class="checkbox"
									type="checkbox"
									name={q.id}
									value={o.value}
									checked={((values[q.id] as string[] | undefined) ?? []).includes(o.value)}
									onchange={() => (values[q.id] = toggleValue(values[q.id] as string[] | undefined, o.value))}
								/>
								<span>{o.label}</span>
							</label>
						{/each}
					</div>
				{:else if q.type === 'number'}
					<input
						class="input min-h-12 text-base"
						type="number"
						inputmode="decimal"
						min={q.min}
						max={q.max}
						step="0.1"
						name={q.id}
						value={values[q.id] ?? ''}
						oninput={(e) => {
							const raw = e.currentTarget.value;
							values[q.id] = raw === '' ? undefined : Number(raw);
						}}
					/>
				{:else}
					<textarea
						class="textarea text-base"
						rows="3"
						name={q.id}
						maxlength={q.maxLength}
						value={(values[q.id] as string | undefined) ?? ''}
						oninput={(e) => (values[q.id] = e.currentTarget.value)}
					></textarea>
				{/if}

				{#if errors[q.id]}
					<p id="{q.id}-error" class="text-sm text-error-600-400" role="alert">{errors[q.id]}</p>
				{/if}
			</fieldset>
		{/each}

		<div class="flex items-center justify-between gap-3">
			{#if step > 0}
				<button type="button" class="btn min-h-12 preset-tonal" onclick={back} disabled={busy}>Back</button>
			{:else}
				<span></span>
			{/if}
			<button type="submit" class="btn min-h-12 preset-filled-tertiary-500" disabled={busy}>
				{last ? 'Submit' : 'Next'}
			</button>
		</div>
	</form>
</section>
