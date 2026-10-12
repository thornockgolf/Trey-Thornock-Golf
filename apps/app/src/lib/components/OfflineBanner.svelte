<script lang="ts">
	import WifiOff from '@lucide/svelte/icons/wifi-off';
	import { online } from '#lib/online.svelte';
</script>

<!-- Spec 3.B.1 / style-guide 10.2: shell stays usable offline, uploads and chat are paused -->
{#if !online.current}
	<div role="status" aria-live="polite" class="border-b border-primary-200 bg-primary-50 px-4 py-2.5 text-xs text-secondary-500 dark:border-surface-700 dark:bg-surface-800 dark:text-secondary-100">
		<div class="mx-auto flex max-w-app items-center gap-2.5">
			<WifiOff class="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
			<span><strong class="font-semibold">You're offline.</strong> Uploads and messages are paused until you reconnect. What you see may be out of date.</span>
		</div>
	</div>
{/if}
