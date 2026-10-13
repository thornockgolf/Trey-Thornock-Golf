<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import { PHOTO_TYPES, subscriptionLabel, type ProfileDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { ApiError, apiClient } from '#lib/coach/coach-client';
	import { formFrom, formProblems, initials, photoProblem, photoType, toRequest, type ProfileForm } from './profile-form';

	interface Props {
		profile: ProfileDto;
		apiBase?: string;
	}
	let { profile: initial, apiBase = '/api' }: Props = $props();

	// svelte-ignore state_referenced_locally
	let profile = $state<ProfileDto>(initial);
	// svelte-ignore state_referenced_locally
	let form = $state<ProfileForm>(formFrom(initial));
	let saving = $state(false);
	let error = $state<string | null>(null);
	let photoBusy = $state(false);
	let photoError = $state<string | null>(null);
	let localPreview = $state<string | null>(null);

	const problems = $derived(formProblems(form));
	const dirty = $derived(JSON.stringify(form) !== JSON.stringify(formFrom(profile)));
	const api = $derived(apiClient(apiBase));

	const save = async () => {
		if (Object.keys(problems).length > 0) return;
		saving = true;
		error = null;
		try {
			profile = await api.call<ProfileDto>('PUT', '/profile', toRequest(form));
			form = formFrom(profile);
			toaster.success({ title: 'Profile saved' });
		} catch (e) {
			error = e instanceof ApiError ? e.message : 'Could not save your profile. Try again.';
		} finally {
			saving = false;
		}
	};

	const choosePhoto = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		photoError = photoProblem(file) ?? null;
		if (photoError) return;
		photoBusy = true;
		const preview = URL.createObjectURL(file);
		localPreview = preview;
		try {
			const { upload } = await api.call<{ upload: { url: string; headers: Record<string, string> } }>('POST', '/profile/photo', { contentType: photoType(file), sizeBytes: file.size });
			const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: file });
			if (!put.ok) throw new ApiError(put.status, 'The upload did not go through.');
			profile = await api.call<ProfileDto>('POST', '/profile/photo/complete', { contentType: photoType(file) });
			toaster.success({ title: 'Photo updated' });
		} catch (err) {
			photoError = err instanceof ApiError ? err.message : 'Could not upload the photo. Try again.';
			localPreview = null;
		} finally {
			photoBusy = false;
			URL.revokeObjectURL(preview);
		}
	};

	const shownPhoto = $derived(localPreview ?? profile.photoUrl);
	const field = 'input min-h-12 text-base';
	const accept = Object.keys(PHOTO_TYPES).join(',');
</script>

<div class="mx-auto max-w-[900px]">
	<p class="eyebrow">Your space</p>
	<h1 class="h1">Profile</h1>

	<section class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Summary" data-summary>
		<a href="/videos" class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><span class="text-sm text-surface-600-400">Swing videos</span><span class="block font-display text-3xl font-bold tabular-nums">{profile.summary.videos}</span></a>
		<a href="/plans" class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4">
			<span class="text-sm text-surface-600-400">Current plan</span>
			{#if profile.summary.plan}
				<span class="block font-display text-lg font-bold break-words">{profile.summary.plan.title}</span>
				<span class="text-sm text-surface-600-400">{profile.summary.plan.sessionsDone} of {profile.summary.plan.sessions} sessions done</span>
			{:else}
				<span class="block text-surface-600-400">No plan assigned yet</span>
			{/if}
		</a>
		<div class="rounded-container border border-surface-300-700 bg-surface-100-900 p-4"><span class="text-sm text-surface-600-400">Subscription</span><span class="block font-display text-lg font-bold" data-subscription>{subscriptionLabel(profile.summary.subscriptionStatus)}</span></div>
	</section>

	<div class="mt-8 flex items-center gap-4">
		<div class="relative size-24 shrink-0">
			{#if shownPhoto}
				<img src={shownPhoto} alt="" class="size-24 rounded-full border border-surface-300-700 object-cover" data-photo />
			{:else}
				<span class="flex size-24 items-center justify-center rounded-full bg-primary-500 font-display text-3xl font-bold text-white" aria-hidden="true" data-initials>{initials(profile)}</span>
			{/if}
		</div>
		<div class="flex flex-col gap-1">
			<label class="btn min-h-12 cursor-pointer preset-outlined-surface-300-700 {photoBusy ? 'opacity-60' : ''}">
				<Camera class="size-5" strokeWidth={1.8} aria-hidden="true" /> {photoBusy ? 'Uploading…' : shownPhoto ? 'Change photo' : 'Add a photo'}
				<input type="file" {accept} class="sr-only" disabled={photoBusy} onchange={choosePhoto} data-photo-input />
			</label>
			<p class="text-xs text-surface-600-400">JPEG, PNG or WebP, up to 5 MB.</p>
			{#if photoError}<p class="text-sm text-error-700-300" role="alert">{photoError}</p>{/if}
		</div>
	</div>

	<form class="mt-8 flex flex-col gap-5" onsubmit={(e) => (e.preventDefault(), void save())} aria-label="Profile details" data-profile-form>
		<label class="flex flex-col gap-1"><span class="font-display font-semibold">Name</span><input class={field} bind:value={form.displayName} maxlength="80" autocomplete="name" data-name /></label>
		<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
			<label class="flex flex-col gap-1"><span class="font-display font-semibold">Handicap</span>
				<input class={field} inputmode="decimal" bind:value={form.handicap} aria-invalid={!!problems.handicap} aria-describedby="hcp-help" data-handicap />
				<span id="hcp-help" class="text-sm {problems.handicap ? 'text-error-700-300' : 'text-surface-600-400'}" role={problems.handicap ? 'alert' : undefined}>{problems.handicap ?? 'From -10 to 54. Leave blank if you do not have one.'}</span>
			</label>
			<fieldset class="flex flex-col gap-1"><legend class="font-display font-semibold">Dominant hand</legend>
				<div class="flex gap-2" role="radiogroup" aria-label="Dominant hand">
					{#each [['right', 'Right'], ['left', 'Left']] as [v, name] (v)}
						<label class="btn min-h-12 flex-1 cursor-pointer {form.hand === v ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}"><input type="radio" class="sr-only" name="hand" value={v} bind:group={form.hand} />{name}</label>
					{/each}
				</div>
			</fieldset>
		</div>
		<label class="flex flex-col gap-1"><span class="font-display font-semibold">Home course</span><input class={field} bind:value={form.homeCourse} maxlength="120" /></label>
		<label class="flex flex-col gap-1"><span class="font-display font-semibold">Goals</span><textarea class="textarea min-h-24 text-base" rows="3" maxlength="1000" bind:value={form.goals} placeholder="e.g. Break 90 consistently by spring"></textarea></label>
		<label class="flex flex-col gap-1"><span class="font-display font-semibold">Equipment</span><textarea class="textarea min-h-20 text-base" rows="2" maxlength="1000" bind:value={form.equipment} placeholder="Clubs, shafts, anything Trey should know"></textarea></label>
		<label class="flex flex-col gap-1"><span class="font-display font-semibold">Injuries or limitations</span><textarea class="textarea min-h-20 text-base" rows="2" maxlength="1000" bind:value={form.limitations}></textarea></label>
		{#if error}<p class="rounded-container border border-error-500 p-3" role="alert">{error}</p>{/if}
		<div class="flex items-center gap-3">
			<button type="submit" class="btn min-h-12 preset-filled-primary-500" disabled={saving || !dirty || Object.keys(problems).length > 0} data-save-profile>{saving ? 'Saving…' : 'Save profile'}</button>
			{#if dirty}<span class="text-sm text-surface-600-400" role="status">Unsaved changes</span>{/if}
		</div>
	</form>
</div>
