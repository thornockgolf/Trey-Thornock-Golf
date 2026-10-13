<script lang="ts">
	import Trash from '@lucide/svelte/icons/trash';
	import {
		AnnotationCanvas,
		AnnotationToolbar,
		CommentaryAudio,
		type CommentarySegment,
		History,
		SHOW_FOR_OPTIONS,
		VideoPlayer,
		endFor,
		formatClock,
		showForOf,
		type PlaybackSource
	} from '@ttg/ui';
	import {
		describeShape,
		isVisibleAt,
		type AnnotationColor,
		type AnnotationDto,
		type AnnotationShape,
		type AnnotationTool,
		MAX_ANNOTATIONS_PER_VIDEO
	} from '@ttg/shared';
	import { onMount } from 'svelte';
	import { toaster } from '#lib/toaster';
	import { analysisApi } from '#lib/analysis/analysis-client';
	import { AnnotationApiError, annotationApi } from './annotations-client';

	interface Props {
		videoId: string;
		/** Width, height, fps and duration of the processed video. */
		width: number;
		height: number;
		fps: number;
		durationMs: number;
		source: PlaybackSource;
		refreshSource: () => Promise<PlaybackSource>;
		poster: string | null;
		label: string;
		/** Coaches draw; everyone else sees the drawings read-only. */
		canEdit: boolean;
		apiBase?: string;
		/** The analysis whose recordings play along with the video (the coach's commentary). */
		analysisId?: string | null;
		/** The playhead in ms, on every displayed frame. */
		onTime?: (ms: number) => void;
		/** Open paused at this time (a chat message's video reference). */
		startMs?: number | null;
	}
	let { videoId, width, height, fps, durationMs, source, refreshSource, poster, label, canEdit, apiBase = '/api', analysisId = null, onTime, startMs = null }: Props = $props();

	// A link with a time (`/videos/:id?t=3200`) opens the video at that moment, once.
	let started = false;
	$effect(() => {
		const p = player?.getPlayer();
		if (started || startMs === null || !p) return;
		started = true;
		const go = () => player?.seekMs(Math.min(Math.max(0, startMs), durationMs));
		if (p.readyState() >= 1) go();
		else p.one('loadedmetadata', go);
	});

	const api = $derived(annotationApi(apiBase, videoId));
	const aspect = $derived(width / height);

	let player = $state<ReturnType<typeof VideoPlayer>>();
	let commentary = $state<ReturnType<typeof CommentaryAudio>>();
	let manifest = $state<readonly CommentarySegment[]>([]);

	// the coach's recordings, played from the manifest alongside the video
	const loadCommentary = async () => {
		if (!analysisId) {
			manifest = [];
			return;
		}
		try {
			manifest = (await analysisApi(apiBase).manifest(analysisId)).segments;
		} catch {
			// no commentary is better than a broken page; the video still plays
		}
	};
	$effect(() => {
		void analysisId;
		void loadCommentary();
	});
	let lastExpiredAt = 0;
	const onClipExpired = () => {
		if (Date.now() - lastExpiredAt < 10_000) return;
		lastExpiredAt = Date.now();
		void loadCommentary();
	};

	/** The player and the reload hooks, for the recorder that sits next to this component. */
	export const getVideoPlayer = () => player;
	export const reloadCommentary = loadCommentary;
	export const reloadAnnotations = () => reload();
	let saved = $state<AnnotationDto[]>([]);
	let loadFailed = $state(false);
	let currentMs = $state(0);

	interface Draft {
		shape: AnnotationShape;
		startMs: number;
	}
	let drafts = $state(History.empty<Draft>());
	let tool = $state<AnnotationTool | null>(null);
	let color = $state<AnnotationColor>('#D4A017');
	let showFor = $state<number | null>(2000);
	let saving = $state(false);

	const reload = async () => {
		try {
			saved = await api.list();
			loadFailed = false;
		} catch {
			loadFailed = true;
		}
	};
	onMount(() => void reload());

	const draftEnd = (d: Draft) => endFor(d.startMs, showFor, durationMs);
	const visible = $derived([
		...saved.filter((a) => isVisibleAt(a, currentMs)).map((a) => a.shape),
		...drafts.present.filter((d) => isVisibleAt({ startMs: d.startMs, endMs: draftEnd(d) }, currentMs)).map((d) => d.shape)
	]);
	const sorted = $derived([...saved].sort((a, b) => a.startMs - b.startMs || a.createdAt.localeCompare(b.createdAt)));
	const markers = $derived([...new Set(saved.map((a) => a.startMs))]);

	const pauseForDrawing = () => player?.getPlayer()?.pause();
	const addDraft = (shape: AnnotationShape) => {
		if (saved.length + drafts.present.length >= MAX_ANNOTATIONS_PER_VIDEO) {
			toaster.error({ title: 'Too many annotations', description: `A video can have at most ${MAX_ANNOTATIONS_PER_VIDEO}.` });
			return;
		}
		drafts = drafts.add({ shape, startMs: currentMs });
	};

	const save = async () => {
		saving = true;
		let remaining = [...drafts.present];
		try {
			for (const d of drafts.present) {
				await api.create({ startMs: d.startMs, endMs: draftEnd(d), shape: d.shape });
				remaining = remaining.slice(1);
			}
			toaster.success({ title: 'Saved' });
		} catch (e) {
			toaster.error({ title: "Couldn't save the drawing", description: e instanceof AnnotationApiError ? e.message : 'Check your connection and try again.' });
		} finally {
			// keep what did not save so nothing the coach drew is lost
			drafts = remaining.length === 0 ? drafts.reset() : History.empty<Draft>().set(remaining);
			saving = false;
			await reload();
		}
	};

	const conflict = async (e: unknown, what: string) => {
		if (e instanceof AnnotationApiError && e.isConflict) {
			toaster.error({ title: 'Someone else changed this', description: 'Showing the latest version.' });
			await reload();
		} else {
			toaster.error({ title: `Couldn't ${what}`, description: e instanceof AnnotationApiError ? e.message : 'Check your connection and try again.' });
		}
	};

	const setLength = async (a: AnnotationDto, ms: number | null) => {
		try {
			await api.update(a.id, { version: a.version, endMs: endFor(a.startMs, ms, durationMs) });
			await reload();
		} catch (e) {
			await conflict(e, 'change the length');
		}
	};
	const remove = async (a: AnnotationDto) => {
		try {
			await api.remove(a.id, a.version);
			await reload();
		} catch (e) {
			await conflict(e, 'delete the annotation');
		}
	};
</script>

<VideoPlayer
	bind:this={player}
	{source}
	{refreshSource}
	{poster}
	{fps}
	{durationMs}
	{label}
	{markers}
	onTime={(ms) => {
		currentMs = ms;
		commentary?.tick(ms);
		onTime?.(ms);
	}}
>
	{#snippet overlay()}
		<AnnotationCanvas {aspect} shapes={visible} tool={canEdit ? tool : null} {color} onDraw={addDraft} onBeginDraw={pauseForDrawing} />
		{#if manifest.length > 0}
			<CommentaryAudio bind:this={commentary} player={player?.getPlayer()} segments={manifest} onExpired={onClipExpired} />
		{/if}
	{/snippet}
</VideoPlayer>

{#if canEdit}
	<div class="mt-4">
		<AnnotationToolbar
			bind:tool
			bind:color
			bind:showFor
			canUndo={drafts.canUndo}
			canRedo={drafts.canRedo}
			draftCount={drafts.present.length}
			{saving}
			onUndo={() => (drafts = drafts.undo())}
			onRedo={() => (drafts = drafts.redo())}
			onClear={() => (drafts = drafts.clear())}
			onSave={save}
		/>
	</div>
{/if}

<section class="mt-6" aria-labelledby="ann-heading">
	<h2 id="ann-heading" class="h4">Annotations{sorted.length ? ` (${sorted.length})` : ''}</h2>
	{#if loadFailed}
		<p class="mt-2 text-surface-600-400" role="alert">
			Couldn't load the annotations. <button type="button" class="anchor" onclick={reload}>Try again</button>
		</p>
	{:else if sorted.length === 0}
		<p class="mt-2 text-surface-600-400">{canEdit ? 'None yet. Pause the video, pick a tool and draw.' : 'Your coach has not drawn on this video yet.'}</p>
	{:else}
		<ul class="mt-2 flex flex-col gap-2" data-annotation-list>
			{#each sorted as a (a.id)}
				<li class="flex flex-wrap items-center gap-2 rounded-container border border-surface-300-700 bg-surface-100-900 p-2 {isVisibleAt(a, currentMs) ? 'ring-2 ring-tertiary-500' : ''}">
					<button type="button" class="btn min-h-11 preset-outlined-surface-300-700 tabular-nums" onclick={() => player?.seekMs(a.startMs)} aria-label="Go to {formatClock(a.startMs / 1000)}">
						{formatClock(a.startMs / 1000)}
					</button>
					<span class="min-w-0 flex-1 break-words">
						{describeShape(a.shape, width, height)}
						<span class="text-surface-600-400">
							<span class="sr-only">, shown from {formatClock(a.startMs / 1000)} to {formatClock(a.endMs / 1000)}</span>
							<span aria-hidden="true">· until {formatClock(a.endMs / 1000)}</span>
						</span>
					</span>
					{#if canEdit}
						{@const cur = showForOf(a.startMs, a.endMs, durationMs)}
						<label class="flex items-center gap-1 text-sm">
							<span class="sr-only">Show for</span>
							<select class="select min-h-11 w-auto" value={cur === null ? 'end' : String(cur)} onchange={(e) => setLength(a, e.currentTarget.value === 'end' ? null : Number(e.currentTarget.value))}>
								{#if cur === 'custom'}<option value="custom" disabled>Custom</option>{/if}
								{#each SHOW_FOR_OPTIONS as o (o.label)}
									<option value={o.ms === null ? 'end' : String(o.ms)}>{o.label}</option>
								{/each}
							</select>
						</label>
						<button type="button" class="btn-icon size-11 preset-outlined-error-500" aria-label="Delete annotation at {formatClock(a.startMs / 1000)}" onclick={() => remove(a)}>
							<Trash class="size-5" strokeWidth={1.8} aria-hidden="true" />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
