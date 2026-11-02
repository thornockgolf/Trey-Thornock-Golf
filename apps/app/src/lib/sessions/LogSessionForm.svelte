<script lang="ts">
	import { onDestroy } from 'svelte';
	import { MAX_LOGGED_NOTES, MAX_LOGGED_WORKED_ON, SESSION_TAGS, SESSION_TAG_LABELS, type LoggedSessionDto } from '@ttg/shared';
	import Video from '@lucide/svelte/icons/video';
	import Check from '@lucide/svelte/icons/check';
	import { ApiError, apiClient } from '#lib/coach/coach-client';
	import { localDate } from '#lib/plans/sessions';
	import { toaster } from '#lib/toaster';
	import { surfaceError } from '#lib/form-error';
	import InlineUpload from '#lib/upload/InlineUpload.svelte';
	import { UploadStore } from '#lib/upload/upload-store.svelte';
	import {
		blankForm,
		parseDateParam,
		earliestDate,
		formFromLogged,
		formProblem,
		toCreateRequest,
		toUpdateRequest,
		toggleTag,
		videoStateLabel,
		type LogFormValues
	} from './log-form';

	interface Props {
		/** The drill library as a picker list (names only). */
		drills: readonly { id: string; name: string; category: string | null }[];
		/** Set to edit this log; absent to log a new one. */
		existing?: LoggedSessionDto;
		/** `/api`, or a dev mock. */
		apiBase?: string;
		/** Where video uploads go (defaults to `apiBase`; the dev preview points both at the mock). */
		uploadApiBase?: string;
		/** Called with the saved log (create or edit) or `null` after a delete. */
		onsaved: (saved: LoggedSessionDto | null) => void;
		oncancel?: () => void;
		/** The `?date=` of a new log (the calendar's day button); validated, else today. */
		initialDate?: string | null;
	}
	let { drills, existing, apiBase = '/api', uploadApiBase, onsaved, oncancel, initialDate }: Props = $props();

	// "Today" is the player's own calendar day, so it is decided in the browser.
	const today = localDate();
	// svelte-ignore state_referenced_locally
	let form = $state<LogFormValues>(existing ? formFromLogged(existing) : blankForm(parseDateParam(initialDate, today)));
	// svelte-ignore state_referenced_locally
	let video = $state<LoggedSessionDto['video']>(existing?.video ?? null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let errorEl: HTMLElement | undefined = $state();
	let confirmDelete = $state(false);

	// svelte-ignore state_referenced_locally
	const store = new UploadStore({ apiBase: uploadApiBase ?? apiBase });
	onDestroy(() => store.destroy());
	let uploader: ReturnType<typeof InlineUpload> | undefined = $state();

	const uploading = $derived(store.busy);
	const uploadFailed = $derived(store.state.kind === 'error');

	/** The server has the video: link it to this log (the library lists it as processing). */
	const attach = () => {
		const id = store.videoId;
		if (!id) return;
		form.videoId = id;
		video = { id, status: 'processing', title: null };
		error = null;
		store.reset(); // the "Video attached" row below says it all; hide the upload panel
	};
	const removeVideo = () => {
		form.videoId = null;
		video = null;
		store.reset();
	};

	const api = $derived(apiClient(apiBase));

	/** Shows `message` where it cannot be missed (toast + scrolled to and focused). */
	const fail = (title: string, message: string) => {
		error = message;
		void surfaceError(() => errorEl, title, message);
	};

	const save = async () => {
		let sending = false; // true while the request is in flight: a failure then is the network, otherwise a bug
		error = null;
		busy = true;
		try {
			const problem = formProblem(form, today);
			if (problem) return fail("Can't save yet", problem);
			if (uploading) return fail("Can't save yet", 'Your video is still uploading. Wait for it to finish, or cancel it to save without the video.');
			const body = existing ? toUpdateRequest(form) : toCreateRequest(form);
			sending = true;
			const saved = existing
				? await api.call<LoggedSessionDto>('PATCH', `/logged-sessions/${existing.id}`, body)
				: await api.call<LoggedSessionDto>('POST', '/logged-sessions', body);
			sending = false;
			toaster.success({ title: existing ? 'Session updated' : 'Session logged' });
			onsaved(saved);
		} catch (e) {
			if (!(e instanceof ApiError)) console.error('Saving the session failed', e);
			fail('Session not saved', e instanceof ApiError ? e.message : sending ? 'Could not save your session. Check your connection and try again.' : 'Could not save your session. Please try again.');
		} finally {
			busy = false;
		}
	};

	const remove = async () => {
		if (!existing) return;
		busy = true;
		error = null;
		try {
			await api.call('DELETE', `/logged-sessions/${existing.id}`);
			toaster.success({ title: 'Session deleted' });
			onsaved(null);
		} catch (e) {
			confirmDelete = false;
			fail('Session not deleted', e instanceof ApiError ? e.message : 'Could not delete it. Try again.');
		} finally {
			busy = false;
		}
	};

	const toggleDrill = (id: string, on: boolean) => (form.drillIds = on ? [...form.drillIds, id] : form.drillIds.filter((d) => d !== id));
</script>

<form class="flex max-w-2xl flex-col gap-6" oninput={() => (error = null)} onsubmit={(e) => (e.preventDefault(), void save())} aria-label={existing ? 'Edit practice session' : 'Log a practice session'} data-log-form>
	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Day you practised</span>
		<input class="input min-h-12 w-full text-base sm:w-56" type="date" bind:value={form.date} max={today} min={earliestDate(today)} required data-date />
	</label>

	<fieldset class="flex flex-col gap-2">
		<legend class="font-display text-sm font-semibold">What was in it? <span class="font-body font-normal text-surface-600-400">(pick one or more)</span></legend>
		<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
			{#each SESSION_TAGS as tag (tag)}
				{@const on = form.tags.includes(tag)}
				<button
					type="button"
					class="btn min-h-12 justify-start gap-2 sm:justify-center {on ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}"
					aria-pressed={on}
					onclick={() => ((form.tags = toggleTag(form.tags, tag)), (error = null))}
					data-tag-button={tag}
				>
					<span class="flex size-5 shrink-0 items-center justify-center">{#if on}<Check class="size-5" strokeWidth={2.5} aria-hidden="true" />{/if}</span>
					{SESSION_TAG_LABELS[tag]}
				</button>
			{/each}
		</div>
	</fieldset>

	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">What did you work on? <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
		<input class="input min-h-12 w-full text-base" type="text" maxlength={MAX_LOGGED_WORKED_ON} placeholder="For example, wedges inside 60 yards" bind:value={form.workedOn} data-worked-on />
	</label>

	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">How many minutes? <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
		<input class="input min-h-12 w-28 text-base" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" bind:value={form.minutes} data-minutes />
	</label>

	{#if drills.length > 0}
		<details class="rounded-container border border-surface-200-800 surface-raised" data-drill-picker>
			<summary class="flex min-h-12 cursor-pointer items-center justify-between gap-2 p-3 font-display text-sm font-semibold">
				<span>Drills from the library <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
				{#if form.drillIds.length > 0}<span class="badge preset-tonal-primary">{form.drillIds.length} picked</span>{/if}
			</summary>
			<ul class="flex max-h-64 flex-col gap-1 overflow-y-auto border-t border-surface-200-800 p-2">
				{#each drills as d (d.id)}
					<li>
						<label class="flex min-h-11 items-center gap-3 rounded-base px-2 hover:bg-surface-100-900">
							<input class="checkbox size-5" type="checkbox" checked={form.drillIds.includes(d.id)} onchange={(e) => toggleDrill(d.id, e.currentTarget.checked)} disabled={!form.drillIds.includes(d.id) && form.drillIds.length >= 10} />
							<span class="min-w-0 flex-1">{d.name}{#if d.category} <span class="text-xs text-surface-600-400">· {d.category}</span>{/if}</span>
						</label>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<label class="flex flex-col gap-1">
		<span class="font-display text-sm font-semibold">Notes <span class="font-body font-normal text-surface-600-400">(optional)</span></span>
		<textarea class="textarea min-h-28 w-full text-base" rows="4" maxlength={MAX_LOGGED_NOTES} placeholder="What felt good, what did not" bind:value={form.notes} data-notes></textarea>
		<span class="self-end text-xs text-surface-600-400 tabular-nums">{form.notes.length} / {MAX_LOGGED_NOTES}</span>
	</label>

	<section class="flex flex-col gap-2" aria-labelledby="video-heading">
		<h2 id="video-heading" class="font-display text-sm font-semibold">A video from this session <span class="font-body font-normal text-surface-600-400">(optional)</span></h2>
		<InlineUpload bind:this={uploader} {store} apiBase={uploadApiBase ?? apiBase} onuploaded={attach} />
		{#if video && !uploading}
			<p class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-container border border-surface-200-800 surface-raised p-3" data-attached-video={video.status}>
				<Video class="size-5 shrink-0" aria-hidden="true" />
				<span class="min-w-0 flex-1">
					{#if video.status === 'ready'}<a class="anchor font-medium" href="/videos/{video.id}">Video attached</a>{:else}<span class="font-medium">Video attached.</span>{/if}
					<span class="text-sm text-surface-600-400">{videoStateLabel(video.status)}</span>
				</span>
				<button type="button" class="btn min-h-11 preset-tonal-error" onclick={removeVideo}>Remove</button>
			</p>
		{/if}
		{#if !uploading}
			<div>
				<button type="button" class="btn min-h-12 preset-outlined-secondary-500" onclick={() => uploader?.open()} data-add-video>
					<Video class="size-5" aria-hidden="true" /> {video ? 'Use a different video' : 'Add a video'}
				</button>
			</div>
		{/if}
		{#if uploadFailed}<p class="text-sm text-surface-600-400">If the upload keeps failing you can still save the session without the video and add it later by editing it.</p>{/if}
	</section>

	{#if error}<p class="rounded-base border border-error-200-800 bg-error-50-950 p-3 text-error-700-300" role="alert" tabindex="-1" bind:this={errorEl} data-form-error>{error}</p>{/if}

	<div class="flex flex-wrap items-center gap-3">
		<button type="submit" class="btn min-h-12 flex-1 preset-filled-primary-500 sm:flex-none" disabled={busy || uploading} data-save>
			{busy ? 'Saving…' : uploading ? 'Uploading video…' : existing ? 'Save changes' : 'Save session'}
		</button>
		{#if oncancel}<button type="button" class="btn min-h-12 preset-tonal-surface" onclick={oncancel} disabled={busy}>Cancel</button>{/if}
		{#if existing}
			{#if confirmDelete}
				<span class="flex items-center gap-2" role="group" aria-label="Confirm delete">
					<button type="button" class="btn min-h-12 preset-filled-error-500" onclick={remove} disabled={busy} data-confirm-delete>Delete it</button>
					<button type="button" class="btn min-h-12 preset-tonal-surface" onclick={() => (confirmDelete = false)}>Keep it</button>
				</span>
			{:else}
				<button type="button" class="btn min-h-12 preset-tonal-error sm:ml-auto" onclick={() => (confirmDelete = true)} disabled={busy}>Delete session</button>
			{/if}
		{/if}
	</div>
</form>
