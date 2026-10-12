export type NavLink = { label: string; href: string };
export type NavEntry = NavLink & { mobileLabel?: string; items?: NavLink[] };

/** Home page navigation. Hash links resolve on the home page. Copy matches legacy/index.html. */
export const homeNav: NavEntry[] = [
	{
		label: 'Home',
		href: '#home',
		items: [
			{ label: 'Top of Page', href: '#home' },
			{ label: 'Start Your Assessment', href: '#assessment' },
			{ label: 'Coaching Philosophy', href: '#coaching-built-around-you' },
			{ label: 'Who I Coach', href: '#who-i-coach' }
		]
	},
	{
		label: 'Golf Lessons',
		href: '#lessons',
		items: [
			{ label: 'Programs Overview', href: '#lessons' },
			{ label: 'The Lesson Experience', href: '#lesson-experience' },
			{ label: 'Technology', href: '#technology' },
			{ label: 'Club Fitting', href: '#club-fitting' },
			{ label: 'Pricing', href: '#pricing' },
			{ label: 'Online & Private Coaching', href: '#other-coaching' },
			{ label: 'Golf Lessons in Durham (Full Guide)', href: '/golf-lessons-durham' }
		]
	},
	{ label: 'Junior Golf', href: '#junior' },
	{
		label: 'Development',
		mobileLabel: 'Player Development',
		href: '#development',
		items: [
			{ label: 'Development System', href: '#development' },
			{ label: 'Practice With Purpose', href: '#practice-purpose' },
			{ label: 'Proven Results', href: '#results' },
			{ label: 'Why Trey?', href: '#why-trey' }
		]
	},
	{ label: 'About', mobileLabel: 'About Trey', href: '#about' },
	{ label: 'Testimonials', href: '#testimonials' },
	{
		label: 'Contact',
		href: '#contact',
		items: [
			{ label: 'FAQ', href: '#faq' },
			{ label: 'Book a Lesson', href: '#book' },
			{ label: 'Locations', href: '#locations' },
			{ label: 'Contact Info', href: '#contact' },
			{ label: 'Newsletter Signup', href: '#newsletter' }
		]
	}
];
