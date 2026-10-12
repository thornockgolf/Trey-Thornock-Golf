<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import QuestionnaireStepper from '#lib/questionnaire/QuestionnaireStepper.svelte';
	import { answerText } from '#lib/questionnaire/steps';

	let { data } = $props();

	// Resume a draft; otherwise show the last response with a retake button; otherwise start fresh.
	let retaking = $state(false);
	const showForm = $derived(retaking || data.latest === null || data.draft !== null);
	const initial = $derived(data.draft?.answers ?? (retaking ? (data.latest?.answers ?? {}) : {}));
	const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>Swing intake | Trey Thornock Golf</title></svelte:head>

<div class="mb-6">
	<p class="eyebrow">Intake</p>
	<h1 class="h1">Tell Trey about your game</h1>
</div>

{#if showForm}
	{#key data.draft?.id ?? (retaking ? 'retake' : 'new')}
		<QuestionnaireStepper
			sections={data.sections}
			{initial}
			onDone={async () => {
				retaking = false;
				await invalidateAll();
			}}
		/>
	{/key}
{:else if data.latest}
	<section class="card surface-raised border border-surface-200-800 rounded-container p-5 md:p-7" aria-labelledby="done-heading">
		<h2 id="done-heading" class="h2">Thanks, Trey has your answers</h2>
		<p class="mb-5 text-surface-600-400">Submitted {date(data.latest.completedAt ?? data.latest.updatedAt)} (response {data.latest.version}).</p>
		<dl class="flex flex-col gap-4">
			{#each data.sections as s (s.id)}
				{#each s.questions as q (q.id)}
					{#if data.latest.answers[q.id] !== undefined}
						<div>
							<dt class="font-display font-semibold text-surface-700-300">{q.label}</dt>
							<dd>{answerText(q, data.latest.answers[q.id])}</dd>
						</div>
					{/if}
				{/each}
			{/each}
		</dl>
		<button type="button" class="btn mt-6 min-h-12 preset-tonal" onclick={() => (retaking = true)}>Retake</button>
	</section>
{/if}
