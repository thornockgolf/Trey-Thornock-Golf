<script lang="ts">
	import BillingPage from '#lib/billing/BillingPage.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Billing | Trey Thornock Golf</title></svelte:head>

<BillingPage billing={data.billing} checkout={data.checkout} />
