<script lang="ts">
	import { tick } from 'svelte';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Library from '@lucide/svelte/icons/library';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Search from '@lucide/svelte/icons/search';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Video from '@lucide/svelte/icons/video';
	import X from '@lucide/svelte/icons/x';
	import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_LENGTH, SEARCH_MAX_LENGTH, cleanQuery, highlightParts, type SearchKind, type SearchResponse, type SearchResultDto } from '@ttg/shared';

	interface Props {
		/** `/api` in the app, a mock path in dev previews. */
		apiBase?: string;
		/** Navigate to a result (the shell passes `goto`; tests pass a stub). */
		go: (href: string) => unknown;
		/** The current path: any change closes the sheet and panel. */
		pathname?: string;
	}
	let { apiBase = '/api', go, pathname = '' }: Props = $props();

	const ICONS: Record<SearchKind, typeof Search> = { player: UserRound, video: Video, reference: Library, message: MessageSquare, plan: ClipboardList, drill: Dumbbell, note: StickyNote };

	let q = $state('');
	let open = $state(false); // results panel
	let sheet = $state(false); // phone: full-screen search
	let status = $state<'idle' | 'loading' | 'done' | 'error'>('idle');
	let response = $state<SearchResponse | null>(null);
	let active = $state(-1);
	let input = $state<HTMLInputElement>();
	let root = $state<HTMLElement>();
	let list = $state<HTMLElement>();
	let seq = 0;

	const clean = $derived(cleanQuery(q));
	const options = $derived((response?.categories ?? []).flatMap((c) => c.results));
	const indexOf = (r: SearchResultDto) => options.findIndex((o) => o.kind === r.kind && o.id === r.id);
	const showPanel = $derived(open && q.trim().length > 0);
	const count = $derived(options.length);
	// what screen readers hear after each search
	const announcement = $derived(
		status === 'loading'
			? 'Searching'
			: status === 'error'
				? 'Search failed'
				: status === 'done' && response
					? count === 0
						? `No results for ${response.q}`
						: `${count} result${count === 1 ? '' : 's'} in ${response.categories.length} ${response.categories.length === 1 ? 'category' : 'categories'}`
					: ''
	);

	const run = async (term: string, signal: AbortSignal, mine: number) => {
		try {
			const res = await fetch(`${apiBase}/search?q=${encodeURIComponent(term)}`, { signal, headers: { accept: 'application/json' } });
			if (!res.ok) throw new Error(String(res.status));
			const body = (await res.json()) as SearchResponse;
			if (mine !== seq) return;
			response = body;
			active = body.categories.length ? 0 : -1;
			status = 'done';
		} catch (e) {
			if (mine !== seq || (e as Error).name === 'AbortError') return;
			status = 'error';
		}
	};

	let retry = $state(0);
	// Debounced: every change of the query cancels the pending and in-flight search.
	$effect(() => {
		const term = clean;
		void retry;
		seq += 1;
		const mine = seq;
		if (!term) {
			status = 'idle';
			response = null;
			active = -1;
			return;
		}
		status = 'loading';
		const ctl = new AbortController();
		const t = setTimeout(() => void run(term, ctl.signal, mine), SEARCH_DEBOUNCE_MS);
		return () => {
			clearTimeout(t);
			ctl.abort();
		};
	});

	// any navigation (a result, or the bottom bar under the sheet) closes the sheet and panel
	$effect(() => {
		void pathname;
		open = false;
		sheet = false;
	});

	const close = () => {
		open = false;
		sheet = false;
	};
	const choose = (href: string) => {
		close();
		void go(href);
	};
	export const focus = async () => {
		open = true;
		sheet = true; // below md this is the full-screen sheet; from md up it is a no-op for layout
		await tick();
		input?.focus();
		input?.select();
	};

	$effect(() => {
		if (active < 0 || !list) return;
		list.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView({ block: 'nearest' });
	});

	const optionId = (i: number) => `search-opt-${i}`;
	const onInputKey = (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			if (!count) return;
			e.preventDefault();
			open = true;
			active = e.key === 'ArrowDown' ? (active + 1) % count : (active - 1 + count) % count;
		} else if (e.key === 'Enter') {
			const pick = options[active] ?? (status === 'done' ? options[0] : undefined);
			if (pick) {
				e.preventDefault();
				choose(pick.href);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (showPanel && !sheet) close();
			else if (q) {
				q = '';
			} else {
				close();
				input?.blur();
			}
		}
	};

	// `/` or Ctrl/Cmd+K from anywhere that is not a text field
	const onWindowKey = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null;
		const typing = !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
		const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
		const chord = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
		if (!slash && !chord) return;
		e.preventDefault();
		void focus();
	};
	const onPointerDown = (e: Event) => {
		if (open && !sheet && root && !root.contains(e.target as Node)) open = false;
	};
</script>

<svelte:window onkeydown={onWindowKey} onpointerdown={onPointerDown} />

<div bind:this={root} class="flex justify-end md:block md:w-full md:max-w-md" data-coach-search>
	<!-- phone: the icon that opens the sheet -->
	<button type="button" class="btn-icon size-11 rounded-full hover:preset-tonal-surface md:hidden" aria-label="Search" aria-haspopup="dialog" aria-expanded={sheet} onclick={focus} data-search-open>
		<Search class="size-5" strokeWidth={1.8} aria-hidden="true" />
	</button>

	<div
		class={sheet ? 'fixed inset-0 z-50 flex flex-col gap-2 bg-surface-100-900 p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] md:relative md:z-auto md:block md:bg-transparent md:p-0 md:pb-0' : 'hidden md:relative md:block'}
		role={sheet ? 'dialog' : undefined}
		aria-label={sheet ? 'Search' : undefined}
		aria-modal={sheet ? 'true' : undefined}
		data-search-surface
	>
		<div class="flex items-center gap-2">
			<div class="relative min-w-0 flex-1">
				<Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-surface-600-400" strokeWidth={1.8} aria-hidden="true" />
				<input
					bind:this={input}
					bind:value={q}
					type="search"
					role="combobox"
					enterkeyhint="search"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					maxlength={SEARCH_MAX_LENGTH}
					placeholder="Search players, videos, messages…"
					aria-label="Search players, videos, messages, plans and notes"
					aria-expanded={showPanel}
					aria-controls="search-listbox"
					aria-autocomplete="list"
					aria-activedescendant={showPanel && active >= 0 && count ? optionId(active) : undefined}
					class="input min-h-11 w-full rounded-full border border-surface-300-700 bg-surface-50-950 py-2 pr-12 pl-9 text-base md:text-sm [&::-webkit-search-cancel-button]:hidden"
					onfocus={() => (open = true)}
					oninput={() => (open = true)}
					onkeydown={onInputKey}
					data-search-input
				/>
				<span class="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-surface-300-700 px-1.5 text-xs text-surface-600-400 {q ? '' : 'md:inline'}" aria-hidden="true">/</span>
				{#if q}
					<button type="button" class="btn-icon absolute top-1/2 right-0 size-11 -translate-y-1/2 rounded-full" aria-label="Clear search" onclick={() => { q = ''; input?.focus(); }}>
						<X class="size-4" strokeWidth={2} aria-hidden="true" />
					</button>
				{/if}
			</div>
			{#if sheet}<button type="button" class="btn min-h-11 px-3 md:hidden" onclick={close}>Cancel</button>{/if}
		</div>

		<p class="sr-only" role="status" aria-live="polite" data-search-status>{announcement}</p>

		{#if showPanel || (sheet && !q)}
			<div
				bind:this={list}
				class="min-h-0 flex-1 overflow-y-auto overscroll-contain md:absolute md:top-full md:right-0 md:left-0 md:mt-2 md:max-h-[50dvh] md:w-[max(100%,min(40rem,50vw))] md:flex-none surface-raised md:rounded-container md:border md:border-surface-300-700 md:shadow-lg {status === 'loading' && response ? 'opacity-60' : ''}"
				data-search-panel
			>
				{#if !clean}
					<p class="px-4 py-4 text-sm text-surface-700-300" data-search-hint>
						{q.trim().length > 0 ? `Type at least ${SEARCH_MIN_LENGTH} characters.` : 'Find a player, a video, a message, a plan, a drill or a private note. Typos are fine.'}
					</p>
				{:else if status === 'error'}
					<div class="flex flex-col items-start gap-2 px-4 py-4" data-search-error>
						<p class="text-sm text-error-700-300">Search did not work. Check your connection and try again.</p>
						<button type="button" class="btn min-h-11 preset-tonal-surface" onclick={() => (retry += 1)}>Try again</button>
					</div>
				{:else if status === 'loading' && !response}
					<p class="px-4 py-4 text-sm text-surface-700-300" data-search-loading>Searching…</p>
				{:else if response && response.categories.length === 0}
					<p class="px-4 py-4 text-sm text-surface-700-300" data-search-empty>No matches for “{response.q}”. Try fewer letters or another word.</p>
				{:else if response}
					<div id="search-listbox" role="listbox" aria-label="Search results" class="py-1">
						{#each response.categories as cat (cat.kind)}
							{@const Icon = ICONS[cat.kind]}
							<div role="group" aria-labelledby="search-cat-{cat.kind}" data-search-category={cat.kind}>
								<h3 id="search-cat-{cat.kind}" class="sticky top-0 z-10 flex items-center gap-2 border-b border-surface-200-800 bg-surface-100-900 px-4 py-1.5 text-xs font-bold tracking-wider text-tertiary-800 uppercase dark:text-tertiary-400">
									<Icon class="size-3.5" strokeWidth={2} aria-hidden="true" />{cat.label}
								</h3>
								{#each cat.results as r (r.id)}
									{@const i = indexOf(r)}
									<a
										id={optionId(i)}
										role="option"
										aria-selected={i === active}
										href={r.href}
										tabindex="-1"
										class="flex min-h-11 flex-col justify-center gap-0.5 px-4 py-2 text-surface-950-50 no-underline hover:bg-surface-200-800 {i === active ? 'bg-surface-200-800' : ''}"
										onmousedown={(e) => e.preventDefault()}
										onmousemove={() => (active = i)}
										onclick={(e) => {
											if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
											e.preventDefault();
											choose(r.href);
										}}
									>
										<span class="truncate text-sm font-medium">{@render marked(r.title)}</span>
										{#if r.subtitle}<span class="truncate text-xs text-surface-700-300">{r.subtitle}</span>{/if}
										{#if r.snippet}<span class="line-clamp-2 text-xs text-surface-800-200">{@render marked(r.snippet)}</span>{/if}
									</a>
								{/each}
								{#if cat.more}<p class="px-4 py-1.5 text-xs text-surface-700-300">More matches. Type more to narrow them down.</p>{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#snippet marked(text: string)}
	{#each highlightParts(text, response?.q ?? '') as part, n (n)}{#if part.match}<mark class="rounded-sm bg-tertiary-300-700 px-0.5 text-inherit">{part.text}</mark>{:else}{part.text}{/if}{/each}
{/snippet}
