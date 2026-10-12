import type { Role } from '@ttg/shared';

export type IconName =
	| 'home'
	| 'video'
	| 'upload'
	| 'messages'
	| 'plans'
	| 'calendar'
	| 'profile'
	| 'billing'
	| 'compare'
	| 'library'
	| 'dashboard'
	| 'players';

export interface NavItem {
	label: string;
	href: string;
	icon: IconName;
	/** false until the screen exists: shown disabled so the shell never links to a 404. Flip as features land. */
	enabled: boolean;
}

export interface Nav {
	/** Sidebar (lg and up) and rail (md to lg). */
	main: NavItem[];
	/** Phone bottom bar: up to 5 items. */
	bottom: NavItem[];
	/** The gold action: a new video upload. */
	upload: NavItem;
}

const upload: NavItem = { label: 'Upload', href: '/videos/new', icon: 'upload', enabled: false };

const player: Nav = {
	main: [
		{ label: 'Home', href: '/', icon: 'home', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: false },
		{ label: 'Compare', href: '/compare', icon: 'compare', enabled: false },
		{ label: 'Messages', href: '/messages', icon: 'messages', enabled: false },
		{ label: 'Plans', href: '/plans', icon: 'plans', enabled: false },
		{ label: 'Calendar', href: '/calendar', icon: 'calendar', enabled: false },
		{ label: 'Profile', href: '/profile', icon: 'profile', enabled: false },
		{ label: 'Billing', href: '/billing', icon: 'billing', enabled: false }
	],
	bottom: [
		{ label: 'Home', href: '/', icon: 'home', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: false },
		upload,
		{ label: 'Messages', href: '/messages', icon: 'messages', enabled: false },
		{ label: 'Plans', href: '/plans', icon: 'plans', enabled: false }
	],
	upload
};

const coach: Nav = {
	main: [
		{ label: 'Dashboard', href: '/coach', icon: 'dashboard', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: false },
		{ label: 'Compare', href: '/compare', icon: 'compare', enabled: false },
		{ label: 'Messages', href: '/messages', icon: 'messages', enabled: false },
		{ label: 'Library', href: '/coach/library', icon: 'library', enabled: false }
	],
	bottom: [
		{ label: 'Dashboard', href: '/coach', icon: 'dashboard', enabled: true },
		{ label: 'Videos', href: '/videos', icon: 'video', enabled: false },
		upload,
		{ label: 'Messages', href: '/messages', icon: 'messages', enabled: false },
		{ label: 'Library', href: '/coach/library', icon: 'library', enabled: false }
	],
	upload
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
