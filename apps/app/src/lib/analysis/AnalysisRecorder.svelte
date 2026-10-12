<script lang="ts">
	import Camera from '@lucide/svelte/icons/camera';
	import Circle from '@lucide/svelte/icons/circle';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Square from '@lucide/svelte/icons/square';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { MIN_SEGMENT_MS, overlaps, type SegmentDto } from '@ttg/shared';
	import { onDestroy, onMount } from 'svelte';
	import { toaster } from '#lib/toaster';
	import { AnalysisApiError, analysisApi, failureMessage, waitForSegment } from './analysis-client';
	import {
		barLayout,
		formatElapsed,
		formatMs,
		mediaErrorMessage,
		pickRecorderType,
		rangeProblem,
		recorderBitrates,
		takeRange,
		type RecordedRange,
		type RecorderType
	} from './recorder-logic';

	/** The parts of the video.js player the recorder drives. */
	interface Player {
		currentTime(): number | undefined;
		muted(muted: boolean): unknown;
		playbackRate(rate: number): unknown;
		pause(): unknown;
		play(): Promise<void> | undefined;
		ended(): boolean | undefined;
		one(event: string, fn: () => void): unknown;
		on(event: string, fn: () => void): unknown;
		off(event: string, fn: () => void): unknown;
	}

	interface Props {
		videoId: string;
		durationMs: number;
		/** The coach's analysis of this video; created on the first save when null. */
		analysisId: string | null;
		/** The video player to record over (from `AnnotatedPlayer.getVideoPlayer()`). */
		getPlayer: () => { getPlayer: () => Player | undefined; seekMs: (ms: number) => void } | undefined;
		/** The playhead in ms. */
		currentMs: number;
		/** The recordings or annotations changed: reload what plays. */
		onChanged: () => void;
		/** A new analysis was created. */
		onAnalysis: (id: string) => void;
		apiBase?: string;
	}
	let { videoId, durationMs, analysisId, getPlayer, currentMs, onChanged, onAnalysis, apiBase = '/api' }: Props = $props();

	type Phase = 'idle' | 'starting' | 'recording' | 'review' | 'saving' | 'processing';
	interface Take {
		blob: Blob;
		url: string;
		range: RecordedRange;
		type: RecorderType;
	}

	const api = $derived(analysisApi(apiBase));
	let phase = $state<Phase>('idle');
	let message = $state<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);
	let camera = $state(false);
	// svelte-ignore state_referenced_locally
	let range = $state<RecordedRange>({ startMs: 0, endMs: durationMs });
	let live = $state<SegmentDto[]>([]);
	let elapsedMs = $state(0);
	let take = $state<Take | null>(null);
	let annotationsInRange = $state(0);
	let annotationsChoice = $state<'keep' | 'remove'>('keep');

	const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
	const busy = $derived(phase !== 'idle' && phase !== 'review');
	const problem = $derived(rangeProblem(range, durationMs));
	const bar = $derived(barLayout(live, durationMs));
	const replaces = $derived((r: RecordedRange) => live.some((s) => overlaps(s, r.startMs, r.endMs)));

	const reloadSegments = async () => {
		if (!analysisId) {
			live = [];
			return;
		}
		try {
			live = (await api.listSegments(analysisId)).segments;
		} catch {
			// the bar just stays as it was
		}
	};
	onMount(() => void reloadSegments());

	// ---- recording
	let stream: MediaStream | undefined;
	let recorder: MediaRecorder | undefined;
	let chunks: Blob[] = [];
	let timer: ReturnType<typeof setInterval> | undefined;
	let stopping = false;
	let startedAtMs = 0;
	let recordType: RecorderType | undefined;
	let t0 = 0;

	const releaseStream = () => {
		stream?.getTracks().forEach((t) => t.stop());
		stream = undefined;
	};
	const clearTimer = () => {
		if (timer) clearInterval(timer);
		timer = undefined;
	};

	const playhead = (p: Player) => Math.round((p.currentTime() ?? 0) * 1000);

	const startRecording = async () => {
		message = null;
		if (!supported) {
			message = { kind: 'error', text: 'This browser cannot record. Use a current Chrome, Edge, Firefox or Safari.' };
			return;
		}
		if (problem) {
			message = { kind: 'error', text: problem };
			return;
		}
		const type = pickRecorderType(camera, (m) => MediaRecorder.isTypeSupported(m));
		if (!type) {
			message = { kind: 'error', text: camera ? 'This browser cannot record video. Turn the camera off to record voice only.' : 'This browser cannot record audio.' };
			return;
		}
		const vp = getPlayer();
		const player = vp?.getPlayer();
		if (!vp || !player) return;
		phase = 'starting';
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: camera ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false });
		} catch (e) {
			phase = 'idle';
			message = { kind: 'error', text: mediaErrorMessage(e, camera) };
			return;
		}
		recordType = type;
		chunks = [];
		stopping = false;
		const rec = new MediaRecorder(stream, { mimeType: type.mimeType, ...recorderBitrates(camera) });
		recorder = rec;
		rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
		rec.onerror = () => void finishTake('The recording stopped unexpectedly.');

		// the video is silent while recording (only the commentary is wanted), plays at normal speed, from the start of the range
		player.muted(true);
		player.playbackRate(1);
		player.pause();
		await new Promise<void>((resolve) => {
			const done = () => resolve();
			player.one('seeked', done);
			vp.seekMs(range.startMs);
			setTimeout(done, 800); // a seek to where it already is fires nothing
		});
		rec.start(1000);
		startedAtMs = playhead(player);
		t0 = performance.now();
		elapsedMs = 0;
		phase = 'recording';
		// pausing the video by hand ends the take: the recording would otherwise run on over a still picture
		player.on('pause', onVideoPause);
		await player.play()?.catch(() => {});
		timer = setInterval(() => {
			elapsedMs = performance.now() - t0;
			if (playhead(player) >= range.endMs - 20 || player.ended()) void finishTake();
		}, 100);
	};

	const onVideoPause = () => {
		if (!stopping) void finishTake();
	};

	/** Stop recording and show the take for review. `failed` explains an unexpected stop. */
	const finishTake = async (failed?: string) => {
		if (stopping || phase !== 'recording') return;
		stopping = true;
		clearTimer();
		const player = getPlayer()?.getPlayer();
		const rec = recorder;
		const stoppedAt = player ? playhead(player) : range.endMs;
		player?.off('pause', onVideoPause);
		player?.pause();
		player?.muted(false);
		if (rec && rec.state !== 'inactive') {
			await new Promise<void>((resolve) => {
				rec.onstop = () => resolve();
				rec.stop();
			});
		}
		releaseStream();
		recorder = undefined;
		const type = recordType!;
		const blob = new Blob(chunks, { type: type.contentType });
		chunks = [];
		const taken = takeRange(startedAtMs, stoppedAt, durationMs);
		// the take runs to the end of the chosen range at most (the check for it runs every 100 ms)
		taken.endMs = Math.min(taken.endMs, range.endMs);
		if (failed) {
			phase = 'idle';
			message = { kind: 'error', text: failed };
			return;
		}
		if (taken.endMs - taken.startMs < MIN_SEGMENT_MS || blob.size === 0) {
			phase = 'idle';
			message = { kind: 'error', text: 'That was too short to keep. Record at least half a second.' };
			return;
		}
		await prepareReview({ blob, url: URL.createObjectURL(blob), range: taken, type });
	};

	const stopNow = () => void finishTake();

	// ---- review
	const prepareReview = async (t: Take) => {
		take = t;
		annotationsChoice = 'keep';
		annotationsInRange = 0;
		phase = 'review';
		// the keep/remove question only matters when this re-records something that already has a recording
		if (analysisId && replaces(t.range)) {
			try {
				annotationsInRange = (await api.listSegments(analysisId, t.range)).annotationsInRange ?? 0;
			} catch {
				annotationsInRange = 0;
			}
		}
	};

	const discard = () => {
		if (take) URL.revokeObjectURL(take.url);
		take = null;
		phase = 'idle';
	};

	const retake = () => {
		if (!take) return;
		range = { ...take.range };
		discard();
		void startRecording();
	};

	const save = async () => {
		if (!take) return;
		const t = take;
		message = null;
		phase = 'saving';
		try {
			let id = analysisId;
			if (!id) {
				id = (await api.createAnalysis(videoId)).id;
				onAnalysis(id);
			}
			const created = await api.createSegment(id, {
				startMs: t.range.startMs,
				endMs: t.range.endMs,
				contentType: t.type.contentType,
				sizeBytes: t.blob.size,
				annotations: annotationsInRange > 0 ? annotationsChoice : 'keep'
			});
			await api.uploadRecording(created.upload, t.blob);
			// the object can take a moment to show up for the check
			for (let attempt = 0; ; attempt++) {
				try {
					await api.completeSegment(id, created.segment.id);
					break;
				} catch (e) {
					if (!(e instanceof AnalysisApiError) || e.status !== 409 || attempt >= 3) throw e;
					await new Promise((r) => setTimeout(r, 700));
				}
			}
			phase = 'processing';
			const outcome = await waitForSegment(() => api.getSegment(id!, created.segment.id));
			if (outcome.state === 'ready') {
				discard();
				message = { kind: 'success', text: `Saved ${formatMs(t.range.startMs)} to ${formatMs(t.range.endMs)}.` };
				await reloadSegments();
				onChanged();
			} else if (outcome.state === 'failed') {
				phase = 'review';
				message = { kind: 'error', text: `${failureMessage(outcome.segment?.errorCode ?? null)} Your earlier recording is unchanged.` };
			} else {
				phase = 'review';
				message = { kind: 'error', text: 'Processing is taking longer than usual. Your earlier recording is unchanged; check back in a minute.' };
			}
		} catch (e) {
			phase = 'review';
			message = { kind: 'error', text: e instanceof AnalysisApiError ? e.message : 'The recording was not saved. Check your connection and try again.' };
		}
	};

	// ---- undo
	let undoing = $state(false);
	const undo = async () => {
		if (!analysisId) return;
		undoing = true;
		try {
			const r = await api.undo(analysisId);
			toaster.success({ title: 'Undone', description: r.restoredAnnotations > 0 ? `${r.restoredAnnotations} annotation(s) came back.` : undefined });
			await reloadSegments();
			onChanged();
		} catch (e) {
			toaster.error({ title: "Couldn't undo", description: e instanceof AnalysisApiError ? e.message : 'Try again.' });
		} finally {
			undoing = false;
		}
	};

	// ---- choosing the range
	const pickSegment = (s: { startMs: number; endMs: number }) => {
		if (busy) return;
		range = { startMs: s.startMs, endMs: s.endMs };
	};
	const selection = $derived(durationMs > 0 ? { left: (range.startMs / durationMs) * 100, width: Math.max(0.5, ((range.endMs - range.startMs) / durationMs) * 100) } : null);

	onDestroy(() => {
		clearTimer();
		getPlayer()?.getPlayer()?.off('pause', onVideoPause);
		if (recorder && recorder.state !== 'inactive') recorder.stop();
		releaseStream();
		if (take) URL.revokeObjectURL(take.url);
	});
</script>

<section class="flex flex-col gap-4 rounded-container border border-surface-300-700 bg-surface-100-900 p-4 md:p-5" aria-labelledby="rec-heading" data-recorder data-analysis={analysisId}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 id="rec-heading" class="h4">Record your analysis</h2>
		<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={!analysisId || busy || phase === 'review' || undoing} onclick={undo} data-undo>
			{#if undoing}<LoaderCircle class="size-4 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Undo2 class="size-4" strokeWidth={1.8} aria-hidden="true" />{/if}
			Undo last change
		</button>
	</div>

	{#if !supported}
		<p class="rounded-container border border-error-500 p-3" role="alert">This browser cannot record. Use a current Chrome, Edge, Firefox or Safari.</p>
	{/if}

	<!-- the timeline: recordings so far, and the part that will be recorded -->
	<div>
		<p class="mb-1 text-sm text-surface-600-400" id="bar-label">Recordings on the video. Tap one to re-record that part.</p>
		<div class="relative h-12 rounded-base bg-surface-200-800" role="group" aria-labelledby="bar-label" data-timeline>
			{#each bar as s (s.id)}
				<button
					type="button"
					class="absolute top-0 h-full rounded-base border border-primary-700 bg-primary-300 text-xs font-semibold text-primary-950 hover:bg-primary-200 focus-visible:outline-2 focus-visible:outline-tertiary-500 disabled:opacity-60"
					style:left="{s.left}%"
					style:width="{s.width}%"
					aria-label="Recording from {formatMs(s.startMs)} to {formatMs(s.endMs)}"
					disabled={busy}
					onclick={() => pickSegment(s)}
					data-segment
				></button>
			{/each}
			{#if selection}
				<span class="pointer-events-none absolute top-0 h-full rounded-base border-2 border-tertiary-500 bg-tertiary-500/20" style:left="{selection.left}%" style:width="{selection.width}%" aria-hidden="true"></span>
			{/if}
			<span class="pointer-events-none absolute top-0 h-full w-0.5 bg-secondary-500" style:left="{durationMs > 0 ? (currentMs / durationMs) * 100 : 0}%" aria-hidden="true"></span>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="w-14 font-display text-sm font-semibold text-surface-700-300">Start</span>
			<span class="min-w-16 tabular-nums" data-range-start>{formatMs(range.startMs)}</span>
			<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy} onclick={() => (range = { ...range, startMs: Math.round(currentMs) })}>Set to playhead</button>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<span class="w-14 font-display text-sm font-semibold text-surface-700-300">End</span>
			<span class="min-w-16 tabular-nums" data-range-end>{formatMs(range.endMs)}</span>
			<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy} onclick={() => (range = { ...range, endMs: Math.round(currentMs) })}>Set to playhead</button>
		</div>
	</div>
	<div class="flex flex-wrap gap-2">
		<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy} onclick={() => (range = { startMs: 0, endMs: durationMs })}>Whole video</button>
		<button type="button" class="btn min-h-11 preset-outlined-surface-300-700" disabled={busy} onclick={() => (range = { startMs: Math.round(currentMs), endMs: durationMs })}>From playhead to the end</button>
	</div>
	{#if problem && phase === 'idle'}<p class="text-sm text-error-700-300" role="status">{problem}</p>{/if}

	{#if phase === 'review' && take}
		<div class="flex flex-col gap-3 rounded-container border border-surface-300-700 bg-surface-50-950 p-3" data-review>
			<p class="font-display font-semibold">Review your take: {formatMs(take.range.startMs)} to {formatMs(take.range.endMs)}</p>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video src={take.url} controls playsinline class="max-h-60 w-full rounded-base bg-black" aria-label="Your recording"></video>
			{#if annotationsInRange > 0}
				<fieldset class="flex flex-col gap-2" data-annotation-choice>
					<legend class="text-sm">This part has {annotationsInRange} annotation{annotationsInRange === 1 ? '' : 's'}. What should happen to {annotationsInRange === 1 ? 'it' : 'them'}?</legend>
					<label class="flex min-h-11 items-center gap-2"><input type="radio" class="radio" name="ann" value="keep" bind:group={annotationsChoice} /> Keep {annotationsInRange === 1 ? 'it' : 'them'} (default)</label>
					<label class="flex min-h-11 items-center gap-2"><input type="radio" class="radio" name="ann" value="remove" bind:group={annotationsChoice} /> Remove {annotationsInRange === 1 ? 'it' : 'them'} (Undo brings {annotationsInRange === 1 ? 'it' : 'them'} back)</label>
				</fieldset>
			{/if}
			<div class="flex flex-wrap gap-2">
				<button type="button" class="btn min-h-12 preset-filled-tertiary-500" onclick={save} data-save>Save</button>
				<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" onclick={retake}>Record again</button>
				<button type="button" class="btn min-h-12 preset-outlined-surface-300-700" onclick={discard}>Discard</button>
			</div>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-3">
			{#if phase === 'recording'}
				<button type="button" class="btn min-h-12 preset-filled-error-500" onclick={stopNow} data-stop>
					<Square class="size-5" fill="currentColor" strokeWidth={0} aria-hidden="true" /> Stop
				</button>
				<span class="flex items-center gap-2 font-display font-semibold" role="timer" aria-label="Recording time">
					<span class="size-3 rounded-full bg-error-500 motion-safe:animate-pulse" aria-hidden="true"></span>
					<span class="tabular-nums" data-elapsed>{formatElapsed(elapsedMs)}</span>
				</span>
			{:else}
				<button type="button" class="btn min-h-12 preset-filled-primary-500" disabled={busy || !!problem || !supported} onclick={startRecording} data-record>
					{#if phase === 'starting'}<LoaderCircle class="size-5 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />{:else}<Circle class="size-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />{/if}
					{replaces(range) ? 'Re-record this part' : 'Record'}
				</button>
				<label class="flex min-h-11 items-center gap-2 text-sm">
					<input type="checkbox" class="checkbox" bind:checked={camera} disabled={busy} data-camera />
					<Camera class="size-4" strokeWidth={1.8} aria-hidden="true" /> Camera on
				</label>
			{/if}
		</div>
		{#if phase === 'saving' || phase === 'processing'}
			<p class="flex items-center gap-2 text-surface-600-400" role="status">
				<LoaderCircle class="size-4 motion-safe:animate-spin" strokeWidth={1.8} aria-hidden="true" />
				{phase === 'saving' ? 'Uploading your recording…' : 'Getting it ready. Your earlier recording stays until this one is done.'}
			</p>
		{/if}
		{#if phase === 'idle' || phase === 'starting'}
			<p class="text-sm text-surface-600-400">
				The video plays without sound from {formatMs(range.startMs)} while you talk. Stop, or pause the video, to end the take early.
			</p>
		{/if}
	{/if}

	{#if message}
		<p class="rounded-container border p-3 {message.kind === 'error' ? 'border-error-500' : message.kind === 'success' ? 'border-success-500' : 'border-surface-300-700'}" role={message.kind === 'error' ? 'alert' : 'status'} data-message>{message.text}</p>
	{/if}
</section>
