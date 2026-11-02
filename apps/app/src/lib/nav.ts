import type { Role } from '@ttg/shared';

export type IconName =
	| 'home'
	| 'video'
	| 'messages'
	| 'plans'
	| 'calendar'
	| 'profile'
	| 'billing'
	| 'compare'
	| 'library'
	| 'dashboard'
	| 'players'
	| 'feedback';

export interface NavItem {
	label: string;
	href: string;
	icon: IconName;
	/** Disabled while offline (chat is paused offline: spec 3.B.1). */
	needsNetwork?: boolean;
	/** false until the screen exists: shown disabled so the shell never links to a 404. Flip as features land. */
	enabled: boolean;
}

export interface Nav {
	/** Sidebar (lg and up) and rail (md to lg). */
	main: NavItem[];
	/** Phone bottom bar: up to 5 items; we use 4, the rest of `main` is in the top-bar hamburger menu. */
	bottom: NavItem[];
}

const player: Nav = {
	main: [
		{ label: 'Home', href: '/', icon: 'home', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: true },
		{ label: 'Plans', href: '/plans', icon: 'plans', enabled: true },
		{ label: 'Calendar', href: '/calendar', icon: 'calendar', enabled: true },
		{ label: 'Profile', href: '/profile', icon: 'profile', enabled: true },
		{ label: 'Billing', href: '/billing', icon: 'billing', enabled: true }
	],
	bottom: [
		{ label: 'Home', href: '/', icon: 'home', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: true },
		{ label: 'Calendar', href: '/calendar', icon: 'calendar', enabled: true },
		{ label: 'Plans', href: '/plans', icon: 'plans', enabled: true }
	]
};

/** No Videos entry: the dashboard lists the videos to record, and a player's page lists their videos. */
const coach: Nav = {
	main: [
		{ label: 'Dashboard', href: '/coach', icon: 'dashboard', enabled: true },
		{ label: 'Library', href: '/coach/library', icon: 'library', enabled: true },
		{ label: 'Plans', href: '/coach/plans', icon: 'plans', enabled: true }
	],
	bottom: [
		{ label: 'Dashboard', href: '/coach', icon: 'dashboard', enabled: true },
		{ label: 'Plans', href: '/coach/plans', icon: 'plans', enabled: true },
		{ label: 'Library', href: '/coach/library', icon: 'library', enabled: true }
	]
};

/** Navigation for a role. Role comes from the server (`currentUser`), never from the client. */
export const navFor = (role: Role): Nav => (role === 'coach' ? coach : player);

/** Active when on the item, or inside it. A section root such as "/" or "/coach" matches only itself. */
export const isActive = (pathname: string, item: Pick<NavItem, 'href'>) => {
	const sectionRoots = ['/', '/coach'];
	if (pathname === item.href) return true;
	if (sectionRoots.includes(item.href)) return false;
	return pathname.startsWith(`${item.href}/`);
};

/** Destinations in `main` that the phone bottom bar does not show; the top-bar hamburger menu lists these. */
export const overflowItems = (nav: Nav): NavItem[] => {
	const shown = new Set(nav.bottom.map((i) => i.href));
	return nav.main.filter((i) => !shown.has(i.href));
};
