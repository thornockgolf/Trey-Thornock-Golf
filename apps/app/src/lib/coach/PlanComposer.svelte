<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash';
	import { MAX_PLAN_SESSIONS, type DrillDto, type SessionLength } from '@ttg/shared';
	import {
		SESSION_LENGTH_OPTIONS,
		addDrill,
		addSession,
		balanceSession,
		moveItem,
		moveSession,
		remaining,
		removeItem,
		removeSession,
		sessionStatus,
		setMinutes,
		setSessionLength,
		setSessionTitle,
		statusText,
		type ComposerPlan
	} from './composer';

	interface Props {
		plan: ComposerPlan;
		drills: readonly DrillDto[];
		disabled?: boolean;
	}
	let { plan = $bindable(), drills, disabled = false }: Props = $props();

	const byId = $derived(new Map(drills.map((d) => [d.id, d])));
	const categories = $derived([...new Set(drills.map((d) => d.category ?? 'Other'))].sort());
	// the drill chosen in each session's picker
	let picked = $state<Record<string, string>>({});

	const add = (key: string) => {
		const id = picked[key];
		const drill = id ? byId.get(id) : undefined;
		if (!drill) return;
		plan = addDrill(plan, key, drill);
		picked[key] = '';
	};
</script>

<div class="flex flex-col gap-5" data-composer>
	<label class="flex flex-col gap-1">
		<span class="font-display font-semibold text-surface-700-300">Plan title</span>
		<input class="input min-h-12 text-base" type="text" maxlength="120" placeholder="e.g. Short game, 4 weeks" bind:value={plan.title} {disabled} data-plan-title />
	</label>

	{#each plan.sessions as s, si (s.key)}
		{@const st = sessionStatus(s)}
		<section class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4" aria-label="Session {si + 1}" data-session>
			<div class="flex flex-wrap items-end gap-3">
				<label class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="text-sm font-semibold text-surface-700-300">Session {si + 1} title</span>
					<input class="input min-h-11" type="text" maxlength="120" value={s.title} oninput={(e) => (plan = setSessionTitle(plan, s.key, e.currentTarget.value))} {disabled} />
				</label>
				<label class="flex flex-col gap-1">
					<span class="text-sm font-semibold text-surface-700-300">Length</span>
					<select class="select min-h-11" value={String(s.durationMin)} onchange={(e) => (plan = setSessionLength(plan, s.key, Number(e.currentTarget.value) as SessionLength))} {disabled}>
						{#each SESSION_LENGTH_OPTIONS as n (n)}<option value={String(n)}>{n} min</option>{/each}
					</select>
				</label>
				<div class="flex gap-1">
					<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move session {si + 1} up" disabled={disabled || si === 0} onclick={() => (plan = moveSession(plan, s.key, -1))}><ArrowUp class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
					<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move session {si + 1} down" disabled={disabled || si === plan.sessions.length - 1} onclick={() => (plan = moveSession(plan, s.key, 1))}><ArrowDown class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
					<button type="button" class="btn-icon size-11 preset-outlined-error-500" aria-label="Delete session {si + 1}" disabled={disabled || plan.sessions.length === 1} onclick={() => (plan = removeSession(plan, s.key))}><Trash class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
				</div>
			</div>

			{#if s.items.length > 0}
				<ol class="flex flex-col gap-2">
					{#each s.items as item, ii (ii)}
						<li class="flex flex-wrap items-center gap-2 rounded-base border border-surface-300-700 bg-surface-50-950 p-2">
							<span class="min-w-0 flex-1 break-words font-medium">{byId.get(item.drillId)?.name ?? 'Unknown drill'}</span>
							<label class="flex items-center gap-1 text-sm">
								<span class="sr-only">Minutes</span>
								<input class="input min-h-11 w-20 text-center tabular-nums" type="number" min="1" max="90" step="1" value={item.minutes} oninput={(e) => (plan = setMinutes(plan, s.key, ii, e.currentTarget.valueAsNumber))} {disabled} data-minutes />
								min
							</label>
							<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move drill up" disabled={disabled || ii === 0} onclick={() => (plan = moveItem(plan, s.key, ii, -1))}><ArrowUp class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
							<button type="button" class="btn-icon size-11 preset-outlined-surface-300-700" aria-label="Move drill down" disabled={disabled || ii === s.items.length - 1} onclick={() => (plan = moveItem(plan, s.key, ii, 1))}><ArrowDown class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
							<button type="button" class="btn-icon size-11 preset-outlined-error-500" aria-label="Remove drill" {disabled} onclick={() => (plan = removeItem(plan, s.key, ii))}><Trash class="size-4" strokeWidth={1.8} aria-hidden="true" /></button>
						</li>
					{/each}
				</ol>
			{/if}

			<div class="flex flex-wrap items-end gap-2">
				<label class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="text-sm font-semibold text-surface-700-300">Add a drill</span>
					<select class="select min-h-11" bind:value={picked[s.key]} {disabled} data-drill-picker>
						<option value="">Choose a drill</option>
						{#each categories as cat (cat)}
							<optgroup label={cat}>
								{#each drills.filter((d) => (d.category ?? 'Other') === cat) as d (d.id)}<option value={d.id}>{d.name}{d.defaultMinutes ? ` (${d.defaultMinutes} min)` : ''}</option>{/each}
							</optgroup>
						{/each}
					</select>
				</label>
				<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={disabled || !picked[s.key]} onclick={() => add(s.key)} data-add-drill><Plus class="size-4" strokeWidth={1.8} aria-hidden="true" /> Add</button>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm font-semibold {st.kind === 'ok' ? 'text-success-700-300' : st.kind === 'empty' ? 'text-surface-600-400' : 'text-warning-700-300'}" role="status" data-session-status>{statusText(s)}</p>
				{#if st.kind === 'under' || st.kind === 'over'}
					<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" {disabled} onclick={() => (plan = balanceSession(plan, s.key))} data-balance>
						{remaining(s) > 0 ? 'Put the rest on the last drill' : 'Trim the last drill'}
					</button>
				{/if}
			</div>
		</section>
	{/each}

	<div>
		<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" disabled={disabled || plan.sessions.length >= MAX_PLAN_SESSIONS} onclick={() => (plan = addSession(plan))} data-add-session>
			<Plus class="size-5" strokeWidth={1.8} aria-hidden="true" /> Add a session
		</button>
	</div>
</div>
