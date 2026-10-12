<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import House from '@lucide/svelte/icons/house';
	import Library from '@lucide/svelte/icons/library';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Upload from '@lucide/svelte/icons/upload';
	import User from '@lucide/svelte/icons/user';
	import Users from '@lucide/svelte/icons/users';
	import Video from '@lucide/svelte/icons/video';
	import type { IconName } from '#lib/nav';

	let { name, class: className = 'size-5' }: { name: IconName; class?: string } = $props();

	// Lucide at stroke 1.8 (docs/style-guide.md section 9)
	const icons = {
		home: House,
		video: Video,
		upload: Upload,
		messages: MessageSquare,
		plans: ClipboardList,
		calendar: Calendar,
		profile: User,
		billing: CreditCard,
		compare: Columns2,
		library: Library,
		dashboard: LayoutDashboard,
		players: Users
	} as const;
	const Icon = $derived(icons[name]);
</script>

<Icon class={className} strokeWidth={1.8} aria-hidden="true" />
