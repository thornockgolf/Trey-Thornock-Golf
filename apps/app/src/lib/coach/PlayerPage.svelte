<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import {
		buildCalendarItems,
		subscriptionLabel,
		type ProfileDto,
		describeAnswers,
		playerLabel,
		type AssessmentDto,
		type CalendarData,
		type CoachNoteDto,
		type PlanSessionDto,
		type PlayerSummaryDto,
		type QuestionnaireResponseDto,
		type VideoDto
	} from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { formatDate } from '#lib/videos/library';
	import VideoLibrary from '#lib/videos/VideoLibrary.svelte';
	import { ApiError, apiClient } from './coach-client';
	import { sessionProgress } from './player-view';
	import CoachCalendarTools from './CoachCalendarTools.svelte';
	import PlanCalendar from '#lib/calendar/PlanCalendar.svelte';
	import { localDate } from '#lib/plans/sessions';
	import type { View } from '#lib/calendar/calendar-view';

	interface Props {
		player: PlayerSummaryDto;
		questionnaire: QuestionnaireResponseDto | null;
		videos: readonly VideoDto[];
		sessions: readonly PlanSessionDto[];
		notes: readonly CoachNoteDto[];
		calendar: CalendarData;
		assessments: readonly AssessmentDto[];
		profile: ProfileDto;
		apiBase?: string;
		/** Where the dashboard is. */
		backHref?: string;
		/** Where this player's chat opens (hidden in previews without chat). */
		messageHref?: string | null;
	}
	let { player, questionnaire, videos, sessions, notes: initialNotes, calendar: initialCalendar, assessments: initialAssessments, profile, apiBase = '/api', backHref = '/coach', messageHref = `/messages/new?player=${player.id}` }: Props = $props();

	// svelte-ignore state_referenced_locally
	let notes = $state<CoachNoteDto[]>([...initialNotes]);
	// svelte-ignore state_referenced_locally
	let calendar = $state<CalendarData>(initialCalendar);
	// svelte-ignore state_referenced_locally
	let assessments = $state<AssessmentDto[]>([...initialAssessments]);
	let calView = $state<View>('list');
	let today = $state('');
	let calSelected = $state('');
	$effect(() => {
		today = localDate();
		calSelected = calSelected || today;
	});
	const calItems = $derived(buildCalendarItems(calendar));
	let draft = $state('');
	let saving = $state(false);
	let noteError = $state<string | null>(null);

	const described = $derived(questionnaire ? describeAnswers(questionnaire.answers) : []);
	const progress = $derived(sessionProgress(sessions));

	const addNote = async () => {
		saving = true;
		noteError = null;
		try {
			const n = await apiClient(apiBase).players.addNote(player.id, draft);
			notes = [n, ...notes];
			draft = '';
		} catch (e) {
			noteError = e instanceof ApiError ? e.message : 'Could not save the note. Try again.';
		} finally {
			saving = false;
		}
	};

	let confirmingDelete = $state(false);
	let typedName = $state('');
	let deleting = $state(false);
	const deleteName = $derived(playerLabel(player));
	const remove = async () => {
		deleting = true;
		try {
			await apiClient(apiBase).players.delete(player.id);
			window.location.assign(backHref);
		} catch (e) {
			toaster.error({ title: "Couldn't delete the account", description: e instanceof ApiError ? e.message : 'Try again.' });
			deleting = false;
		}
	};

	let ending = $state(false);
	const end = async () => {
		if (!confirm(`Stop coaching ${playerLabel(player)}? Their videos and history stay, but you will no longer see them.`)) return;
		ending = true;
		try {
			await apiClient(apiBase).players.unassign(player.id);
			window.location.assign(backHref);
		} catch (e) {
			toaster.error({ title: "Couldn't end it", description: e instanceof ApiError ? e.message : 'Try again.' });
			ending = false;
		}
	};
</script>

<div class="mx-auto max-w-[1000px]">
	<a href={backHref} class="anchor mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium"><ArrowLeft class="size-4" strokeWidth={1.8} aria-hidden="true" /> Players</a>
	<p class="eyebrow">Player</p>
	<h1 class="h1 break-words" data-player-name>{playerLabel(player)}</h1>
	<p class="mt-1 text-surface-600-400">
		{#if player.email && player.displayName}{player.email} · {/if}Signed up {formatDate(player.joinedAt)}
	</p>
	{#if messageHref}
		<a href={messageHref} class="btn mt-3 min-h-12 preset-filled-primary-500" data-message-player>
			Message {playerLabel(player)}{#if player.unreadMessages > 0}<span class="rounded-full bg-tertiary-500 px-2 text-xs leading-5 font-bold text-surface-950" aria-label="{player.unreadMessages} unread">{player.unreadMessages}</span>{/if}
		</a>
	{/if}

	<section class="mt-6" aria-labelledby="prof-h" data-profile>
		<h2 id="prof-h" class="h3 mb-2">Profile</h2>
		<div class="flex items-start gap-4">
			{#if profile.photoUrl}<img src={profile.photoUrl} alt="" class="size-16 shrink-0 rounded-full border border-surface-300-700 object-cover" />{/if}
			<dl class="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				{#each [['Handicap', profile.handicap === null ? null : String(profile.handicap)], ['Dominant hand', profile.hand ? (profile.hand === 'left' ? 'Left' : 'Right') : null], ['Home course', profile.homeCourse], ['Goals', profile.goals], ['Equipment', profile.equipment], ['Injuries or limitations', profile.limitations], ['Subscription', subscriptionLabel(profile.summary.subscriptionStatus)]] as [label, value] (label)}
					<dt class="text-sm text-surface-600-400">{label}</dt>
					<dd class="break-words">{value ?? 'Not filled in'}</dd>
				{/each}
			</dl>
		</div>
	</section>

	<section class="mt-8" aria-labelledby="notes-h" data-notes>
		<h2 id="notes-h" class="h3">Your notes</h2>
		<p class="mb-3 text-sm text-surface-600-400">Only you can see these. They are never shown to the player.</p>
		<form class="mb-4 flex flex-col gap-2" onsubmit={(e) => (e.preventDefault(), void addNote())}>
			<label class="flex flex-col gap-1"><span class="sr-only">New note</span><textarea class="textarea min-h-24 text-base" rows="3" maxlength="4000" placeholder="e.g. Grip too strong, working on a weaker left hand" bind:value={draft} data-note-input></textarea></label>
			{#if noteError}<p class="text-sm text-error-700-300" role="alert">{noteError}</p>{/if}
			<div><button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={saving || !draft.trim()} data-note-save>{saving ? 'Saving…' : 'Add note'}</button></div>
		</form>
		<ul class="flex flex-col gap-2">
			{#each notes as n (n.id)}
				<li class="rounded-container border border-surface-300-700 bg-surface-100-900 p-3" data-note><p class="whitespace-pre-wrap break-words">{n.body}</p><p class="mt-1 text-xs text-surface-600-400"><time datetime={n.createdAt}>{formatDate(n.createdAt)}</time></p></li>
			{:else}
				<li class="text-surface-600-400">No notes yet.</li>
			{/each}
		</ul>
	</section>

	<section class="mt-10" aria-labelledby="q-h" data-questionnaire>
		<h2 id="q-h" class="h3">Intake questionnaire</h2>
		{#if !questionnaire}
			<p class="text-surface-600-400">They have not completed it yet.</p>
		{:else}
			<p class="mb-3 text-sm text-surface-600-400">Completed {formatDate(questionnaire.completedAt ?? questionnaire.updatedAt)}{questionnaire.version > 1 ? ` (attempt ${questionnaire.version})` : ''}</p>
			<div class="flex flex-col gap-4">
				{#each described as sec (sec.id)}
					<div>
						<h3 class="font-display font-semibold text-secondary-500 dark:text-secondary-100">{sec.title}</h3>
						<dl class="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
							{#each sec.answers as a (a.questionId)}
								<dt class="text-sm text-surface-600-400">{a.label}</dt>
								<dd class="break-words">{a.text}</dd>
							{/each}
						</dl>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="mt-10" aria-labelledby="plan-h" data-plan>
		<h2 id="plan-h" class="h3">Practice plan progress</h2>
		{#if sessions.length === 0}
			<p class="text-surface-600-400">No plan assigned yet. <a class="anchor" href="/coach/plans">Open plans</a></p>
		{:else}
			<p class="mb-3 text-sm text-surface-600-400" data-plan-summary>{progress.sessionsDone} of {progress.sessions} sessions done · {progress.drillsDone} of {progress.drills} drills checked off</p>
			<ul class="flex flex-col gap-2">
				{#each sessions as s (s.id)}
					{@const done = s.items.filter((i) => i.completedAt).length}
					<li class="rounded-container border border-surface-300-700 bg-surface-100-900 p-3">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="font-medium">{s.title ?? 'Session'} <span class="text-sm text-surface-600-400">{s.planTitle ?? ''}</span></span>
							<span class="text-sm text-surface-600-400"><time datetime={s.scheduledOn}>{formatDate(s.scheduledOn)}</time> · {s.durationMin ?? '?'} min</span>
						</div>
						<p class="text-sm {s.completedAt ? 'text-success-700-300' : 'text-surface-600-400'}">{s.completedAt ? 'Done' : `${done} of ${s.items.length} drills`}</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mt-10" aria-labelledby="cal-h" data-calendar-section>
		<h2 id="cal-h" class="h3 mb-3">Calendar, check-ins and tests</h2>
		<div class="flex flex-col gap-5">
			{#if today}<PlanCalendar items={calItems} {today} bind:view={calView} bind:selected={calSelected} />{/if}
			<CoachCalendarTools playerId={player.id} {calendar} {assessments} {apiBase} onCalendar={(c) => (calendar = c)} onAssessments={(a) => (assessments = a)} />
		</div>
	</section>

	<section class="mt-10" aria-labelledby="vid-h" data-videos>
		<h2 id="vid-h" class="h3 mb-3">Videos</h2>
		{#if videos.length === 0}
			<p class="text-surface-600-400">No videos yet.</p>
		{:else}
			<VideoLibrary {videos} label="Player videos" />
		{/if}
	</section>

	<div class="mt-12 border-t border-surface-300-700 pt-6">
		<button type="button" class="btn min-h-11 preset-outlined-error-500" disabled={ending} onclick={end} data-end>Stop coaching this player</button>
	</div>

	<section class="mt-8 rounded-container border border-error-500 p-4" aria-labelledby="del-h" data-delete-account>
		<h2 id="del-h" class="h3 text-error-700-300">Delete this account</h2>
		<p class="mt-1 text-sm">Permanently removes {deleteName}'s account, sign-in, videos, recordings, messages, plans, notes and history. It cannot be undone. Payment records are kept for accounting.</p>
		{#if !confirmingDelete}
			<button type="button" class="btn mt-3 min-h-11 preset-outlined-error-500" onclick={() => (confirmingDelete = true)} data-delete-start>Delete account…</button>
		{:else}
			<form class="mt-3 flex flex-col gap-2" onsubmit={(e) => (e.preventDefault(), void remove())}>
				<label class="flex flex-col gap-1">
					<span class="text-sm">Type <strong class="break-all">{deleteName}</strong> to confirm</span>
					<input class="input min-h-11 text-base" autocomplete="off" bind:value={typedName} data-delete-input />
				</label>
				<div class="flex flex-wrap gap-2">
					<button type="submit" class="btn min-h-11 preset-filled-error-500" disabled={deleting || typedName.trim() !== deleteName} data-delete-confirm>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
					<button type="button" class="btn min-h-11 preset-outlined-surface-500" disabled={deleting} onclick={() => ((confirmingDelete = false), (typedName = ''))}>Cancel</button>
				</div>
			</form>
		{/if}
	</section>
</div>
