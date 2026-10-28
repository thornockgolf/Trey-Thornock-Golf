<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import { MAX_PLAN_PHASES } from '@ttg/shared';
	import { PHASE_LIMITS, addPhase, gapText, lessonCoverage, movePhase, phaseIssuesFor, removePhase, updatePhase, type ComposerPlan } from './composer';

	interface Props {
		plan: ComposerPlan;
		disabled?: boolean;
	}
	let { plan = $bindable(), disabled = false }: Props = $props();

	const total = $derived(plan.sessions.length);
	const coverage = $derived(lessonCoverage(plan));
	const gaps = $derived(gapText(plan));
	const num = (e: Event & { currentTarget: HTMLInputElement }) => e.currentTarget.valueAsNumber;
	// alternate tints so neighbouring phases read apart in the strip
	const tints = ['bg-primary-500', 'bg-secondary-500', 'bg-tertiary-500'];
</script>

<section class="flex min-w-0 flex-col gap-3" aria-labelledby="phases-heading" data-phases>
	<div>
		<h2 id="phases-heading" class="h3">Roadmap phases</h2>
		<p class="text-sm text-surface-600-400">The stages your player sees on their Home timeline. A lesson is one session of this plan; this plan has {total} lesson{total === 1 ? '' : 's'}. Phases are optional and can leave gaps.</p>
	</div>

	{#if plan.phases.length > 0}
		<div class="flex flex-col gap-1" data-coverage>
			<div class="flex gap-0.5" role="img" aria-label={gaps ? `Lessons covered by phases. Not covered: lessons ${gaps}.` : 'Every lesson is covered by a phase.'}>
				{#each coverage as c (c.lesson)}
					<span class="h-3 min-w-0 flex-1 rounded-sm {c.phase === null ? 'border border-dashed border-surface-400-600' : tints[c.phase % tints.length]}" title="Lesson {c.lesson}{c.phase === null ? ': no phase' : `: ${plan.phases[c.phase]?.title || `phase ${c.phase + 1}`}`}"></span>
				{/each}
			</div>
			<p class="text-sm text-surface-600-400" data-gaps>{gaps ? `No phase yet for lesson${gaps.includes('-') || gaps.includes(',') ? 's' : ''} ${gaps}.` : `All ${total} lessons are covered.`}</p>
		</div>
	{/if}

	{#each plan.phases as p, i (p.key)}
		{@const issues = phaseIssuesFor(plan, i)}
		<div class="flex min-w-0 flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" role="group" aria-label="Phase {i + 1}" data-phase>
			<div class="flex items-center justify-between gap-2">
				<p class="flex items-center gap-2 font-display font-semibold text-surface-700-300">
					<span class="inline-block size-3 rounded-sm {tints[i % tints.length]}" aria-hidden="true"></span>
					Phase {i + 1}
				</p>
				<div class="flex gap-1">
					<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move phase {i + 1} up" disabled={disabled || i === 0} onclick={() => (plan = movePhase(plan, p.key, -1))}><ArrowUp class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
					<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move phase {i + 1} down" disabled={disabled || i === plan.phases.length - 1} onclick={() => (plan = movePhase(plan, p.key, 1))}><ArrowDown class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
					<button type="button" class="btn-icon size-11 preset-outlined-error-500" aria-label="Delete phase {i + 1}" {disabled} onclick={() => (plan = removePhase(plan, p.key))}><Trash class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
				</div>
			</div>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">Phase {i + 1} title</span>
				<input class="input min-h-11 text-base" type="text" maxlength={PHASE_LIMITS.title} placeholder="e.g. Build a repeatable setup" value={p.title} oninput={(e) => (plan = updatePhase(plan, p.key, { title: e.currentTarget.value }))} {disabled} data-phase-title />
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">Why it matters</span>
				<span class="text-sm text-surface-600-400">Written to the player, in your voice.</span>
				<textarea class="textarea min-h-24 text-base" rows="3" maxlength={PHASE_LIMITS.description} placeholder="Why this stage comes now and what it unlocks" value={p.description} oninput={(e) => (plan = updatePhase(plan, p.key, { description: e.currentTarget.value }))} {disabled} data-phase-description></textarea>
				<span class="self-end text-xs text-surface-600-400 tabular-nums">{p.description.length}/{PHASE_LIMITS.description}</span>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-sm font-semibold text-surface-700-300">How we measure it <span class="font-normal text-surface-600-400">(optional)</span></span>
				<input class="input min-h-11 text-base" type="text" maxlength={PHASE_LIMITS.measure} placeholder="e.g. 7 of 10 putts holed from 6 feet" value={p.measure} oninput={(e) => (plan = updatePhase(plan, p.key, { measure: e.currentTarget.value }))} {disabled} data-phase-measure />
			</label>

			<fieldset class="flex min-w-0 flex-col gap-1">
				<legend class="text-sm font-semibold text-surface-700-300">Lessons from / to</legend>
				<div class="flex flex-wrap items-center gap-2">
					<label class="flex items-center gap-2">
						<span class="sr-only">First lesson of phase {i + 1}</span>
						<input class="input min-h-11 w-20 text-center tabular-nums" type="number" inputmode="numeric" min="1" max={total} step="1" value={Number.isNaN(p.fromLesson) ? '' : p.fromLesson} oninput={(e) => (plan = updatePhase(plan, p.key, { fromLesson: num(e) }))} {disabled} data-phase-from />
					</label>
					<span aria-hidden="true">to</span>
					<label class="flex items-center gap-2">
						<span class="sr-only">Last lesson of phase {i + 1}</span>
						<input class="input min-h-11 w-20 text-center tabular-nums" type="number" inputmode="numeric" min="1" max={total} step="1" value={Number.isNaN(p.toLesson) ? '' : p.toLesson} oninput={(e) => (plan = updatePhase(plan, p.key, { toLesson: num(e) }))} {disabled} data-phase-to />
					</label>
					<span class="text-sm text-surface-600-400">of {total}</span>
				</div>
			</fieldset>

			{#if issues.length > 0}
				<ul class="list-disc pl-5 text-sm text-error-700-300" role="alert" data-phase-issues>
					{#each issues as m (m)}<li>{m}</li>{/each}
				</ul>
			{/if}
		</div>
	{/each}

	<div>
		<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" disabled={disabled || plan.phases.length >= MAX_PLAN_PHASES} onclick={() => (plan = addPhase(plan))} data-add-phase>
			<Plus class="size-5" strokeWidth={1.8} aria-hidden="true" /> Add phase
		</button>
		{#if plan.phases.length >= MAX_PLAN_PHASES}<span class="ml-2 text-sm text-surface-600-400">Most phases a plan can have: {MAX_PLAN_PHASES}.</span>{/if}
	</div>
</section>
