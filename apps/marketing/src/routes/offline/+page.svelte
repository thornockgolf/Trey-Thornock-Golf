<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import Button from '#lib/components/Button.svelte';
</script>

<svelte:head>
	<title>Offline | {siteConfig.name}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main id="main" class="offline">
	<div class="panel">
		<img class="mark" src="/icons/icon-192.png" width="96" height="96" alt="" />
		<h1>You&rsquo;re offline</h1>
		<p class="lead">
			This page isn&rsquo;t saved on your device yet. Check your connection and try again, or reach Trey
			directly.
		</p>
		<ul class="contact">
			<li><a href={siteConfig.phone.tel}>{siteConfig.phone.display}</a></li>
			<li><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></li>
		</ul>
		<Button href="/" variant="gold">Try again</Button>
	</div>
</main>

<style>
	.offline {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background: var(--page-bg);
		color: var(--text);
		font-family: var(--font-body);
	}
	.panel {
		width: min(100%, 480px);
		text-align: center;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-soft);
		padding: 40px 28px;
	}
	.mark {
		margin: 0 auto 20px;
		border-radius: 20px;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--heading);
		font-size: clamp(1.6rem, 5vw, 2rem);
		line-height: 1.2;
		margin: 0 0 12px;
	}
	.lead {
		color: var(--text-muted);
		margin: 0 0 20px;
		line-height: 1.6;
	}
	.contact {
		list-style: none;
		margin: 0 0 28px;
		padding: 0;
		display: grid;
		gap: 8px;
		font-weight: 600;
	}
	.contact a {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
