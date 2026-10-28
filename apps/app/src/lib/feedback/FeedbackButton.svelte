<script lang="ts">
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import X from '@lucide/svelte/icons/x';
	import {
		FEEDBACK_PRIORITIES,
		FEEDBACK_PRIORITY_LABEL,
		FEEDBACK_TYPES,
		FEEDBACK_TYPE_LABEL,
		MAX_FEEDBACK_BODY,
		MAX_FEEDBACK_TITLE,
		type FeedbackPriority,
		type FeedbackType
	} from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { ApiError, captureContext, feedbackApi } from './feedback-client';

	// TEMPORARY dev tool (docs/system/feedback.md): a floating button that opens a sheet for filing a ticket from anywhere.
	interface Props {
		/** The current path including the query, filed with the ticket. */
		pagePath: string;
		apiBase?: string;
		/** Where "all feedback" lives. */
		href?: string;
	}
	let { pagePath, apiBase = '/api', href = '/feedback' }: Props = $props();

	let dialog = $state<HTMLDialogElement>();
	let title = $state('');
	let body = $state('');
	let type = $state<FeedbackType>('change');
	let priority = $state<FeedbackPriority>('normal');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// The chat input sits at the bottom right of /messages, so the button moves to the top there.
	const atTop = $derived(pagePath.startsWith('/messages') || pagePath.startsWith('/dev/messages'));

	const open = () => {
		error = null;
		dialog?.showModal();
	};
	const close = () => dialog?.close();

	const submit = async () => {
		if (!title.trim() || !body.trim()) {
			error = 'Add a short title and say what you want changed.';
			return;
		}
		busy = true;
		error = null;
		try {
			await feedbackApi(apiBase).create({ title: title.trim(), body: body.trim(), type, priority, ...captureContext(pagePath) });
			toaster.success({ title: 'Feedback saved', description: 'It is in the Feedback list.' });
			title = '';
			body = '';
			type = 'change';
			priority = 'normal';
			close();
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not save your feedback. Try again.';
		} finally {
			busy = false;
		}
	};

	const seg = (on: boolean) => `btn min-h-11 flex-1 px-2 ${on ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}`;
</script>

<button
	type="button"
	class="fixed right-4 z-20 flex size-11 items-center justify-center gap-2 rounded-full border border-surface-300-700 surface-raised font-display text-sm font-semibold shadow-lg md:h-11 md:w-auto md:px-4 {atTop ? 'top-[72px] md:top-[76px]' : 'bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6'}"
	aria-label="Send feedback"
	onclick={open}
	data-feedback-open
>
	<MessageSquarePlus class="size-5" strokeWidth={1.8} aria-hidden="true" />
	<span class="hidden md:inline">Feedback</span>
</button>

<dialog
	bind:this={dialog}
	class="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-t-container border border-surface-300-700 surface-raised p-0 text-inherit backdrop:bg-black/50 md:inset-0 md:m-auto md:h-fit md:max-w-lg md:rounded-container"
	aria-labelledby="feedback-heading"
	data-feedback-sheet
>
	<form class="flex flex-col gap-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onsubmit={(e) => (e.preventDefault(), void submit())}>
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="eyebrow">Temporary</p>
				<h2 id="feedback-heading" class="h3">Send feedback</h2>
			</div>
			<button type="button" class="btn-icon size-11 shrink-0 preset-outlined-surface-300-700" aria-label="Close" onclick={close}><X class="size-5" aria-hidden="true" /></button>
		</div>
		<p class="text-sm text-surface-600-400">Tell us what to change in the app. We note the page you are on, your screen size and your role.</p>

		<label class="flex flex-col gap-1">
			<span class="font-display text-sm font-semibold">Title</span>
			<input class="input min-h-11 text-base" type="text" maxlength={MAX_FEEDBACK_TITLE} bind:value={title} placeholder="Short summary" autocomplete="off" required data-feedback-title />
		</label>
		<label class="flex flex-col gap-1">
			<span class="font-display text-sm font-semibold">What should change?</span>
			<textarea class="textarea min-h-28 text-base" rows="5" maxlength={MAX_FEEDBACK_BODY} bind:value={body} placeholder="What you saw, and what you would like instead" required data-feedback-body></textarea>
		</label>
		<fieldset class="flex flex-col gap-1">
			<legend class="font-display text-sm font-semibold">Type</legend>
			<div class="flex gap-1" role="radiogroup" aria-label="Type">
				{#each FEEDBACK_TYPES as t (t)}
					<button type="button" role="radio" aria-checked={type === t} class={seg(type === t)} onclick={() => (type = t)} data-type={t}>{FEEDBACK_TYPE_LABEL[t]}</button>
				{/each}
			</div>
		</fieldset>
		<fieldset class="flex flex-col gap-1">
			<legend class="font-display text-sm font-semibold">Priority <span class="font-body font-normal text-surface-600-400">(optional)</span></legend>
			<div class="flex gap-1" role="radiogroup" aria-label="Priority">
				{#each FEEDBACK_PRIORITIES as p (p)}
					<button type="button" role="radio" aria-checked={priority === p} class={seg(priority === p)} onclick={() => (priority = p)} data-priority={p}>{FEEDBACK_PRIORITY_LABEL[p]}</button>
				{/each}
			</div>
		</fieldset>

		{#if error}<p class="text-sm text-error-700-300" role="alert" data-feedback-error>{error}</p>{/if}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={busy} data-feedback-submit>{busy ? 'Saving…' : 'Save feedback'}</button>
			<a {href} class="text-sm underline" onclick={close}>See all feedback</a>
		</div>
	</form>
</dialog>
