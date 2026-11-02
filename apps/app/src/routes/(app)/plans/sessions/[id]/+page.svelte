<script lang="ts">
	import SessionDetail from '#lib/plans/SessionDetail.svelte';

	let { data } = $props();
</script>

<SessionDetail session={data.session} />
