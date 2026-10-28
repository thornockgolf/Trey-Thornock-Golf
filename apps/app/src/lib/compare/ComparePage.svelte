<script lang="ts">
		import { page } from '$app/state';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { CompareView, OverlayView, type CompareVideo, type PlaybackSource } from '@ttg/ui';
	import { DEFAULT_OVERLAY, type OverlaySettings, type PlaybackResponse, type VideoDto } from '@ttg/shared';
	import { toaster } from '#lib/toaster';
	import { displayTitle } from '#lib/videos/library';

	interface Props {
		data: {
			role: 'player' | 'coach';
			own: VideoDto[];
			others: VideoDto[];
			references: VideoDto[];
			analysis: { id: string; videoId: string; settings: OverlaySettings } | null;
		};
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
	}
	let { data, apiBase = '/api' }: Props = $props();

	type Mode = 'side' | 'overlay';
	const mine = $derived([...data.own, ...data.others.filter((o) => o.kind !== 'reference' && !data.own.some((v) => v.id === o.id))]);
	const everything = $derived([...mine, ...data.references, ...data.others.filter((o) => o.kind === 'reference' && !data.references.some((r) => r.id === o.id))]);
	const find = (id: string | null) => everything.find((v) => v.id === id) ?? null;

	const q = page.url.searchParams;
	// svelte-ignore state_referenced_locally (starting values come from the address once; the page owns them afterwards)
	const start = {
		a: data.analysis?.videoId ?? q.get('a') ?? data.own[0]?.id ?? null,
		b: data.analysis?.settings.overlayVideoId ?? q.get('b') ?? data.references[0]?.id ?? null,
		mode: (data.analysis ? 'overlay' : q.get('mode') === 'overlay' ? 'overlay' : 'side') as Mode
	};
	let aId = $state<string | null>(start.a);
	let bId = $state<string | null>(start.b);
	let mode = $state<Mode>(start.mode);
	// Compare starts unlinked (the user links it); the overlay is meaningless unsynced, so it starts linked
	let syncSide = $state(false);
	let syncOver = $state(true);
	let points = $state({ a: 0, b: 0 });
	// svelte-ignore state_referenced_locally
	let settings = $state<OverlaySettings>(data.analysis ? { ...data.analysis.settings } : { ...DEFAULT_OVERLAY });
	// svelte-ignore state_referenced_locally
	let analysisId = $state<string | null>(data.analysis?.id ?? null);
	// svelte-ignore state_referenced_locally
	let analysisFor = $state<string | null>(data.analysis?.videoId ?? null);

	// ---- playback URLs for the two chosen videos
	type Loaded = { video: VideoDto; pb: PlaybackResponse } | { error: true } | null;
	let left = $state<Loaded>(null);
	let right = $state<Loaded>(null);

	const load = async (id: string): Promise<Loaded> => {
		try {
			const res = await fetch(`${apiBase}/videos/${id}/playback`, { headers: { accept: 'application/json' } });
			if (!res.ok) return { error: true };
			const pb = (await res.json()) as PlaybackResponse;
			return { video: pb.video, pb };
		} catch {
			return { error: true };
		}
	};
	$effect(() => {
		const id = aId;
		left = null;
		if (!id) return;
		let live = true;
		void load(id).then((r) => live && (left = r));
		return () => (live = false);
	});
	$effect(() => {
		const id = bId;
		right = null;
		if (!id) return;
		let live = true;
		void load(id).then((r) => live && (right = r));
		return () => (live = false);
	});

	const toSource = (p: PlaybackResponse): PlaybackSource => ({ url: p.url, expiresAt: p.expiresAt, spriteUrl: p.spriteUrl, spriteVttUrl: p.spriteVttUrl });
	const toCompare = (l: { video: VideoDto; pb: PlaybackResponse }): CompareVideo => ({
		id: l.video.id,
		label: displayTitle(l.video),
		source: toSource(l.pb),
		refreshSource: async () => {
			const res = await fetch(`${apiBase}/videos/${l.video.id}/playback`, { headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			return toSource((await res.json()) as PlaybackResponse);
		},
		poster: l.pb.video.posterUrl,
		fps: l.video.fps ?? 30,
		durationMs: l.video.durationMs
	});

	// changing a video clears its sync point (the old moment means nothing in a different clip)
	const pick = (which: 'a' | 'b', id: string) => {
		if (which === 'a') {
			aId = id;
			points = { ...points, a: 0 };
			settings = { ...settings, baseSyncMs: 0 };
		} else {
			bId = id;
			points = { ...points, b: 0 };
			settings = { ...settings, overlaySyncMs: 0 };
		}
	};

	// ---- coach: save the overlay setup so the player sees the same view
	const canSave = $derived(data.role === 'coach' && mode === 'overlay' && !!aId && !!bId && find(aId)?.kind !== 'reference');
	let saving = $state(false);
	const save = async () => {
		if (!aId || !bId) return;
		saving = true;
		try {
			const json = { 'content-type': 'application/json', accept: 'application/json' };
			if (!analysisId || analysisFor !== aId) {
				const res = await fetch(`${apiBase}/analyses`, { method: 'POST', headers: json, body: JSON.stringify({ videoId: aId }) });
				if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? 'Could not start the analysis');
				analysisId = ((await res.json()) as { id: string }).id;
				analysisFor = aId;
			}
			const res = await fetch(`${apiBase}/analyses/${analysisId}/overlay`, { method: 'PUT', headers: json, body: JSON.stringify({ ...settings, overlayVideoId: bId }) });
			if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? 'Could not save');
			toaster.success({ title: 'Saved', description: 'The player sees this view under their video.' });
		} catch (e) {
			toaster.error({ title: "Couldn't save the overlay", description: e instanceof Error ? e.message : 'Try again.' });
		} finally {
			saving = false;
		}
	};
</script>

{#snippet picker(which: 'a' | 'b', label: string, value: string | null)}
	<label class="flex min-w-0 flex-1 flex-col gap-1">
		<span class="font-display text-sm font-semibold text-surface-700-300">{label}</span>
		<select class="select min-h-12 text-base" {value} onchange={(e) => pick(which, e.currentTarget.value)} data-pick={which}>
			{#if !value}<option value="" selected disabled>Choose a video</option>{/if}
			{#if mine.length > 0}
				<optgroup label="Swings">
					{#each mine as v (v.id)}<option value={v.id} selected={v.id === value}>{displayTitle(v)}</option>{/each}
				</optgroup>
			{/if}
			{#if data.references.length > 0 || data.others.some((o) => o.kind === 'reference')}
				<optgroup label="Reference library">
					{#each everything.filter((v) => v.kind === 'reference') as v (v.id)}<option value={v.id} selected={v.id === value}>{displayTitle(v)}</option>{/each}
				</optgroup>
			{/if}
		</select>
	</label>
{/snippet}

<div class="mx-auto max-w-[1200px]">
	<p class="eyebrow">Compare</p>
	<h1 class="h1">Compare videos</h1>
	<p class="mt-2 mb-6 max-w-2xl text-surface-600-400">
		Put your swing next to a pro reference (or an earlier swing), side by side or laid over each other. Set a sync point, like address or impact, in each video and turn Sync on to keep them lined up.
	</p>

	{#if everything.length === 0}
		<div class="flex flex-col items-center gap-3 rounded-container border border-dashed border-surface-300-700 bg-surface-100-900 px-6 py-12 text-center">
			<p class="font-display text-lg font-bold text-secondary-500 dark:text-secondary-100">Nothing to compare yet</p>
			<p class="text-surface-600-400">Upload a swing and wait until it shows as Ready. Reference videos appear here once your coach adds them.</p>
			<a href="/videos?upload=1" class="btn min-h-12 preset-filled-tertiary-500">Upload a swing</a>
		</div>
	{:else}
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
			{@render picker('a', mode === 'overlay' ? 'Main video' : 'Left video', aId)}
			{@render picker('b', mode === 'overlay' ? 'Overlay video' : 'Right video', bId)}
			<div class="flex gap-1" role="group" aria-label="Layout">
				{#each [['side', 'Side by side'], ['overlay', 'Overlay']] as [m, name] (m)}
					<button type="button" class="btn min-h-12 {mode === m ? 'preset-filled-primary-500' : 'preset-outlined-surface-300-700'}" aria-pressed={mode === m} onclick={() => (mode = m as Mode)} data-mode={m}>{name}</button>
				{/each}
			</div>
		</div>

		{#if !aId || !bId}
			<p class="rounded-container border border-surface-300-700 bg-surface-100-900 p-6 text-center text-surface-600-400">Choose two videos to compare.</p>
		{:else if left === null || right === null}
			<div class="flex items-center justify-center gap-2 py-16 text-surface-600-400" role="status">
				<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" /> Loading the videos…
			</div>
		{:else if 'error' in left || 'error' in right}
			<p class="rounded-container border border-error-500 p-6 text-center" role="alert">One of these videos could not be loaded. Pick another, or try again in a moment.</p>
		{:else}
			{#key `${aId}:${bId}:${mode}`}
				{#if mode === 'side'}
					<CompareView left={toCompare(left)} right={toCompare(right)} bind:sync={syncSide} bind:points />
				{:else}
					<OverlayView base={toCompare(left)} over={toCompare(right)} bind:settings bind:sync={syncOver} />
				{/if}
			{/key}

			{#if canSave}
				<div class="mt-6 flex flex-wrap items-center gap-3 rounded-container border border-surface-300-700 bg-surface-100-900 p-4">
					<button type="button" class="btn min-h-12 preset-filled-tertiary-500" onclick={save} disabled={saving} data-save-overlay>
						{saving ? 'Saving…' : 'Save for the player'}
					</button>
					<p class="text-sm text-surface-600-400">Saves the overlay, its position and both sync points. The player sees this view from their video.</p>
				</div>
			{/if}
		{/if}
	{/if}
</div>
