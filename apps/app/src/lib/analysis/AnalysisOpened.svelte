<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import { analysisViewLabel, type AnalysisViewDto } from '@ttg/shared';
	import { formatReceiptTime } from '#lib/realtime/chat-state';

	interface Props {
		videoId: string;
		/** The state the page loaded with; refreshed when the tab returns and every so often while it is open. */
		view: AnalysisViewDto | null;
		apiBase?: string;
		/** Refresh interval in ms. */
		pollMs?: number;
	}
	let { videoId, view: initial, apiBase = '/api', pollMs = 30_000 }: Props = $props();

	// svelte-ignore state_referenced_locally
	let view = $state<AnalysisViewDto | null>(initial);
	$effect(() => {
		view = initial;
	});

	const refresh = async () => {
		try {
			const res = await fetch(`${apiBase}/videos/${videoId}/analysis-view`, { headers: { accept: 'application/json' } });
			if (res.ok) view = (await res.json()) as AnalysisViewDto | null;
		} catch {
			/* offline: keep what is shown */
		}
	};
	$effect(() => {
		const onVis = () => document.visibilityState === 'visible' && void refresh();
		document.addEventListener('visibilitychange', onVis);
		const t = setInterval(onVis, pollMs);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			clearInterval(t);
		};
	});
	const opened = $derived(view?.state === 'opened');
</script>

{#if view}
	<p class="mt-1 flex items-center gap-1.5 text-sm {opened ? 'text-success-700-300' : 'text-surface-600-400'}" data-analysis-view data-state={view.state}>
		{#if opened}<Eye class="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{:else}<EyeOff class="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />{/if}
		<span>{analysisViewLabel(view, formatReceiptTime)}</span>
	</p>
{/if}
