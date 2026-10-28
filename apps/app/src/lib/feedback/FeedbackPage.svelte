<script lang="ts">
	import {
		FEEDBACK_PRIORITIES,
		FEEDBACK_PRIORITY_LABEL,
		FEEDBACK_STATUSES,
		FEEDBACK_STATUS_LABEL,
		FEEDBACK_TYPES,
		FEEDBACK_TYPE_LABEL,
		MAX_FEEDBACK_BODY,
		MAX_FEEDBACK_NOTES,
		MAX_FEEDBACK_TITLE,
		feedbackRef,
		type FeedbackDto,
		type FeedbackStatus,
		type FeedbackType,
		type Role
	} from '@ttg/shared';
	import { onMount } from 'svelte';
	import { timeAgo } from '#lib/notifications/time-ago';
	import { toaster } from '#lib/toaster';
	import { ApiError, feedbackApi } from './feedback-client';

	// TEMPORARY dev tool (docs/system/feedback.md): the ticket list. Players see their own, coaches see all and review.
	interface Props {
		role: Role;
		/** The signed-in user's id, to know which tickets are theirs. */
		userId: string;
		apiBase?: string;
	}
	let { role, userId, apiBase = '/api' }: Props = $props();
	const api = $derived(feedbackApi(apiBase));

	let tickets = $state<FeedbackDto[]>([]);
	let loaded = $state(false);
	let loadError = $state<string | null>(null);
	let status = $state<FeedbackStatus | ''>('');
	let type = $state<FeedbackType | ''>('');
	let editing = $state<string | null>(null);
	let draft = $state({ title: '', body: '' });
	let notes = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);
	let exporting = $state(false);

	const load = async () => {
		loadError = null;
		try {
			tickets = await api.list({ ...(status ? { status } : {}), ...(type ? { type } : {}) });
			notes = Object.fromEntries(tickets.map((t) => [t.id, notes[t.id] ?? t.resolutionNotes ?? '']));
		} catch (e) {
			loadError = e instanceof ApiError ? e.message : 'Could not load feedback.';
		} finally {
			loaded = true;
		}
	};
	onMount(() => void load());

	const replace = (t: FeedbackDto) => {
		tickets = tickets.map((x) => (x.id === t.id ? t : x));
		notes[t.id] = t.resolutionNotes ?? '';
	};
	const mutate = async (id: string, fn: () => Promise<FeedbackDto>) => {
		busy = id;
		rowError = null;
		try {
			replace(await fn());
			return true;
		} catch (e) {
			rowError = { id, message: e instanceof ApiError ? e.message : 'Could not save. Try again.' };
			return false;
		} finally {
			busy = null;
		}
	};

	const startEdit = (t: FeedbackDto) => {
		editing = t.id;
		draft = { title: t.title, body: t.body };
		rowError = null;
	};
	const saveEdit = async (t: FeedbackDto) => {
		if (!draft.title.trim() || !draft.body.trim()) {
			rowError = { id: t.id, message: 'Title and description cannot be empty.' };
			return;
		}
		if (await mutate(t.id, () => api.update(t.id, { title: draft.title.trim(), body: draft.body.trim() }))) editing = null;
	};
	const setStatus = (t: FeedbackDto, next: FeedbackStatus) => mutate(t.id, () => api.update(t.id, { status: next }));
	const saveNotes = (t: FeedbackDto) => mutate(t.id, () => api.update(t.id, { resolutionNotes: notes[t.id] ?? '' }));

	const download = (text: string) => {
		const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `feedback-${new Date().toISOString().slice(0, 10)}.md`;
		a.click();
		URL.revokeObjectURL(url);
	};
	/** Copy the open tickets as Markdown for a coding agent; download the file when the clipboard is not available. */
	const exportOpen = async (mode: 'copy' | 'download') => {
		exporting = true;
		try {
			const md = await api.exportMarkdown('open');
			if (mode === 'copy') {
				try {
					await navigator.clipboard.writeText(md);
					toaster.success({ title: 'Copied', description: 'Open tickets are on your clipboard as Markdown.' });
					return;
				} catch {
					toaster.info({ title: 'Clipboard unavailable', description: 'Downloading the file instead.' });
				}
			}
			download(md);
		} catch (e) {
			toaster.error({ title: 'Export failed', description: e instanceof ApiError ? e.message : 'Try again.' });
		} finally {
			exporting = false;
		}
	};

	const tone: Record<FeedbackStatus, string> = {
		open: 'preset-tonal-tertiary',
		in_progress: 'preset-tonal-secondary',
		done: 'preset-tonal-primary',
		wont_do: 'preset-tonal-surface'
	};
</script>

<div class="mx-auto max-w-[760px]">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="eyebrow">Temporary</p>
			<h1 class="h1">Feedback</h1>
		</div>
		{#if role === 'coach'}
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn min-h-11 preset-filled-primary-500" disabled={exporting} onclick={() => exportOpen('copy')} data-export-copy>Export open tickets</button>
				<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={exporting} onclick={() => exportOpen('download')} data-export-download>Download .md</button>
			</div>
		{/if}
	</div>
	<p class="mt-2 text-sm text-surface-600-400">
		{role === 'coach' ? 'Every ticket from players and coaches. Change a status, or add notes for whoever builds the change.' : 'The tickets you have sent.'}
		Use the Feedback button on any page to add one.
	</p>

	<div class="mt-4 grid grid-cols-2 gap-2">
		<label class="flex flex-col gap-1">
			<span class="text-xs font-semibold text-surface-600-400">Status</span>
			<select class="select min-h-11" bind:value={status} onchange={load} data-filter-status>
				<option value="">All</option>
				{#each FEEDBACK_STATUSES as s (s)}<option value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-xs font-semibold text-surface-600-400">Type</span>
			<select class="select min-h-11" bind:value={type} onchange={load} data-filter-type>
				<option value="">All</option>
				{#each FEEDBACK_TYPES as t (t)}<option value={t}>{FEEDBACK_TYPE_LABEL[t]}</option>{/each}
			</select>
		</label>
	</div>

	{#if loadError}
		<p class="mt-6 text-error-700-300" role="alert">{loadError}</p>
	{:else if loaded && tickets.length === 0}
		<p class="mt-6 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 p-8 text-center text-surface-600-400" data-empty>No tickets{status || type ? ' match these filters' : ' yet'}.</p>
	{:else}
		<ul class="mt-4 flex flex-col gap-3" data-list>
			{#each tickets as t (t.id)}
				{@const mine = t.authorId === userId}
				<li class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4" data-ticket={t.id}>
					{#if editing === t.id}
						<form class="flex flex-col gap-3" onsubmit={(e) => (e.preventDefault(), void saveEdit(t))}>
							<label class="flex flex-col gap-1">
								<span class="font-display text-sm font-semibold">Title</span>
								<input class="input min-h-11 text-base" maxlength={MAX_FEEDBACK_TITLE} bind:value={draft.title} data-edit-title />
							</label>
							<label class="flex flex-col gap-1">
								<span class="font-display text-sm font-semibold">Description</span>
								<textarea class="textarea min-h-28 text-base" rows="5" maxlength={MAX_FEEDBACK_BODY} bind:value={draft.body} data-edit-body></textarea>
							</label>
							<div class="flex gap-2">
								<button type="submit" class="btn min-h-11 preset-filled-primary-500" disabled={busy === t.id}>Save</button>
								<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" onclick={() => (editing = null)}>Cancel</button>
							</div>
						</form>
					{:else}
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="badge {tone[t.status]}" data-status-badge>{FEEDBACK_STATUS_LABEL[t.status]}</span>
							<span class="badge preset-outlined-surface-300-700">{FEEDBACK_TYPE_LABEL[t.type]}</span>
							{#if t.priority !== 'normal'}<span class="badge preset-outlined-surface-300-700">{FEEDBACK_PRIORITY_LABEL[t.priority]} priority</span>{/if}
						</div>
						<h2 class="mt-2 h4 break-words">{t.title}</h2>
						<p class="mt-1 text-sm break-words whitespace-pre-wrap">{t.body}</p>
						<p class="mt-2 text-xs break-words text-surface-600-400">
							{feedbackRef(t.id)} · {t.authorRole}{role === 'coach' && t.authorName ? ` (${t.authorName})` : ''} ·
							<code class="break-all">{t.pagePath || 'unknown page'}</code>{t.viewport ? ` · ${t.viewport}` : ''} ·
							<time datetime={t.createdAt} title={new Date(t.createdAt).toLocaleString()}>{timeAgo(t.createdAt)}</time>
						</p>
						{#if role !== 'coach' && t.resolutionNotes}
							<p class="mt-3 rounded-base bg-surface-200-800 p-3 text-sm whitespace-pre-wrap" data-notes-readonly><strong>Notes:</strong> {t.resolutionNotes}</p>
						{/if}
						{#if mine && t.status === 'open'}
							<button type="button" class="btn mt-3 min-h-11 preset-outlined-surface-300-700" onclick={() => startEdit(t)} data-edit>Edit</button>
						{/if}
						{#if role === 'coach'}
							<div class="mt-3 flex flex-col gap-2 border-t border-surface-200-800 pt-3">
								<label class="flex flex-col gap-1">
									<span class="text-xs font-semibold text-surface-600-400">Status</span>
									<select class="select min-h-11" value={t.status} disabled={busy === t.id} onchange={(e) => setStatus(t, e.currentTarget.value as FeedbackStatus)} data-set-status>
										{#each FEEDBACK_STATUSES as s (s)}<option value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>{/each}
									</select>
								</label>
								<label class="flex flex-col gap-1">
									<span class="text-xs font-semibold text-surface-600-400">Agent notes / resolution</span>
									<textarea class="textarea min-h-20 text-base" rows="3" maxlength={MAX_FEEDBACK_NOTES} bind:value={notes[t.id]} data-notes></textarea>
								</label>
								<div><button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy === t.id || (notes[t.id] ?? '') === (t.resolutionNotes ?? '')} onclick={() => saveNotes(t)} data-save-notes>Save notes</button></div>
							</div>
						{/if}
					{/if}
					{#if rowError?.id === t.id}<p class="mt-2 text-sm text-error-700-300" role="alert">{rowError.message}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
