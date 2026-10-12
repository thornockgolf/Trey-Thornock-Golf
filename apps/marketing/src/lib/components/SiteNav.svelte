<script lang="ts">
	import { siteConfig } from '@ttg/shared';
	import { homeNav } from '#lib/content/nav';
	import { appLinks } from '#lib/app-links';
	import Button from './Button.svelte';

	let scrolled = $state(false);
	let open = $state(false);

	function close() {
		open = false;
	}

	$effect(() => {
		document.body.style.overflow = open ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} onkeydown={(e) => e.key === 'Escape' && close()} />

<header class="site-nav" class:scrolled>
	<div class="nav-inner">
		<a href="#home" class="brand" onclick={close}>
			<span class="brand-mark"><img src="/images/img-01.png" alt="Trey Thornock Golf logo" width="40" height="40" /></span>
			<span class="brand-text">TREY THORNOCK<span>Golf Coaching</span></span>
		</a>
		<nav class="primary-links" aria-label="Primary">
			{#each homeNav as entry}
				{#if entry.items}
					<div class="nav-item">
						<a href={entry.href} class="nav-toplink">{entry.label} <span class="nav-caret" aria-hidden="true">&#9662;</span></a>
						<div class="nav-dropdown">
							{#each entry.items as item}<a href={item.href}>{item.label}</a>{/each}
						</div>
					</div>
				{:else}
					<a href={entry.href}>{entry.label}</a>
				{/if}
			{/each}
		</nav>
		{#if appLinks}
			<a href={appLinks.signIn} class="signin">Sign In</a>
			<a href={appLinks.signUp} class="getstarted">Get Started</a>
		{/if}
		<span class="nav-cta"><Button href={siteConfig.bookingUrl} small>Book a Lesson</Button></span>
		<button
			class="hamburger"
			class:open
			aria-label={open ? 'Close menu' : 'Open menu'}
			aria-expanded={open}
			aria-controls="mobile-menu"
			onclick={() => (open = !open)}
		>
			<span></span><span></span><span></span>
		</button>
	</div>
</header>

<div class="mobile-menu" class:open id="mobile-menu" inert={!open}>
	<div class="mobile-scroll">
		{#each homeNav as entry}
			<a href={entry.href} class="mobile-group-title" onclick={close}>{entry.mobileLabel ?? entry.label}</a>
			{#if entry.items}
				{#each entry.items as item}
					{#if item.label !== 'Top of Page'}
						<a href={item.href} class="mobile-sub" onclick={close}>{item.label}</a>
					{/if}
				{/each}
			{/if}
		{/each}
		{#if appLinks}
			<a href={appLinks.signIn} class="mobile-group-title" onclick={close}>Sign In</a>
			<a href={appLinks.signUp} class="mobile-group-title" onclick={close}>Get Started</a>
		{/if}
		<span class="mobile-book"><Button href={siteConfig.bookingUrl} block>Book a Lesson</Button></span>
	</div>
</div>

<style>
	.site-nav {
		position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
		background: light-dark(rgb(255 255 255 / 0.94), rgb(23 29 26 / 0.94));
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--line);
		transition: box-shadow 0.3s ease;
	}
	.site-nav.scrolled { box-shadow: var(--shadow-bar); }
	.nav-inner { max-width: var(--container-site); margin: 0 auto; padding: 14px 22px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
	.brand { display: flex; align-items: center; gap: 10px; }
	/* logo sits on white in dark mode (style-guide 16.2) */
	.brand-mark { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; background: var(--white); }
	.brand-mark img { width: 100%; height: 100%; object-fit: contain; }
	.brand-text { font-family: var(--font-display); font-weight: 700; font-size: 15px; color: var(--heading); line-height: 1.15; letter-spacing: 0.01em; }
	.brand-text span { display: block; font-family: var(--font-body); font-weight: 500; font-size: 10.5px; letter-spacing: 0.14em; color: var(--eyebrow); text-transform: uppercase; margin-top: 2px; }

	.primary-links { display: none; align-items: center; gap: 16px; }
	.primary-links > a { font-family: var(--font-display); font-weight: 500; font-size: 13px; color: var(--text); position: relative; padding: 6px 0; white-space: nowrap; }
	.primary-links > a::after { content: ''; position: absolute; left: 0; bottom: -2px; width: 0; height: 2px; background: var(--gold); transition: width 0.25s ease; }
	.primary-links > a:hover::after { width: 100%; }

	.nav-item { position: relative; }
	.nav-toplink { font-family: var(--font-display); font-weight: 500; font-size: 13px; color: var(--text); padding: 6px 0; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
	.nav-caret { font-size: 9px; color: var(--eyebrow); transition: transform 0.2s ease; }
	.nav-item:hover .nav-caret, .nav-item:focus-within .nav-caret { transform: rotate(180deg); }
	.nav-dropdown {
		position: absolute; top: 100%; left: 50%; transform: translateX(-50%); margin-top: 14px;
		background: var(--card-bg); border-radius: 14px; box-shadow: var(--shadow-lift);
		padding: 8px; min-width: 230px; display: none; flex-direction: column; z-index: 1200; border: 1px solid var(--line);
	}
	/* keyboard users get the same dropdown as hover (legacy was hover-only) */
	.nav-item:hover .nav-dropdown, .nav-item:focus-within .nav-dropdown { display: flex; }
	.nav-dropdown::before { content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: 14px; }
	.nav-dropdown a { font-family: var(--font-body); font-weight: 500; font-size: 13px; color: var(--text); padding: 10px 14px; border-radius: 8px; white-space: nowrap; transition: background 0.15s ease, color 0.15s ease; }
	.nav-dropdown a:hover { background: var(--alt-bg); color: var(--link); }

	.signin, .getstarted { display: none; font-family: var(--font-display); font-weight: 600; font-size: 13px; color: var(--text); white-space: nowrap; }
	.signin:hover, .getstarted:hover { color: var(--link); }
	.nav-cta { display: none; }

	.hamburger { background: none; border: none; padding: 8px; display: flex; flex-direction: column; gap: 5px; z-index: 1200; flex-shrink: 0; cursor: pointer; }
	.hamburger span { width: 24px; height: 2px; background: var(--heading); border-radius: 2px; transition: transform 0.3s ease, opacity 0.3s ease; }
	.hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
	.hamburger.open span:nth-child(2) { opacity: 0; }
	.hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

	.mobile-menu {
		position: fixed; inset: 0; background: var(--navy); z-index: 1100;
		display: flex; flex-direction: column; padding: 80px 28px 28px;
		transform: translateY(-100%); transition: transform 0.4s var(--ease-menu); overflow-y: auto;
		visibility: hidden;
	}
	.mobile-menu.open { transform: translateY(0); visibility: visible; }
	.mobile-scroll { display: flex; flex-direction: column; }
	.mobile-group-title { font-family: var(--font-display); font-weight: 700; font-size: 19px; color: var(--white); padding: 14px 0 8px; border-top: 1px solid rgb(255 255 255 / 0.14); margin-top: 6px; }
	.mobile-scroll > .mobile-group-title:first-child { border-top: none; margin-top: 0; }
	.mobile-sub { font-family: var(--font-body); font-weight: 500; font-size: 15px; color: rgb(255 255 255 / 0.72); padding: 9px 0 9px 14px; border-left: 2px solid rgb(212 160 23 / 0.4); }
	.mobile-book { margin-top: 26px; display: block; }

	@media (min-width: 600px) { .brand-text { font-size: 16px; } }
	@media (min-width: 1180px) {
		.primary-links { display: flex; }
		.nav-cta { display: inline-flex; }
		.signin, .getstarted { display: inline; }
		.hamburger { display: none; }
	}
</style>
