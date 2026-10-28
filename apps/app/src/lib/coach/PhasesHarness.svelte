<script lang="ts">
	// Test-only wrapper: a bindable plan around PhasesEditor, reporting every change.
	import PhasesEditor from './PhasesEditor.svelte';
	import type { ComposerPlan } from './composer';
	let { plan: initial, onChange }: { plan: ComposerPlan; onChange: (p: ComposerPlan) => void } = $props();
	// svelte-ignore state_referenced_locally
	let plan = $state(initial);
	$effect(() => onChange($state.snapshot(plan) as ComposerPlan));
</script>

<PhasesEditor bind:plan />
