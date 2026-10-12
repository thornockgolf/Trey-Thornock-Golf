import type { PillarIconName } from './pillar-icons';

export type Pillar = { title: string; text: string; icon: PillarIconName; num?: string; isNew?: boolean };

export const coachingPillars: Pillar[] = [
	{ num: '01', icon: 'search', title: 'Understand', text: 'Understand your golf game, your goals, and what is limiting your performance.' },
	{ num: '02', icon: 'pulse', title: 'Improve', text: 'Build better skills through simple instruction and purposeful practice.' },
	{ num: '03', icon: 'sparkle', title: 'Perform', text: 'Transfer your skills to the golf course and play with greater confidence.' }
];

export const whoICoach: Pillar[] = [
	{ icon: 'pin', title: 'Beginners', text: 'Build a strong foundation, understand the fundamentals, and learn how to practice effectively.' },
	{ icon: 'pulse', title: 'Recreational Golfers', text: 'Break through plateaus, improve consistency, and turn better practice into lower scores.' },
	{ icon: 'person', title: 'Competitive Junior Golfers', text: 'Develop the technical, strategic, and practice skills needed to compete at the high school and tournament level.' },
	{
		icon: 'sparkle',
		title: 'Competitive & Advanced Players',
		text: 'Fine-tune performance, identify specific weaknesses, and develop a structured plan for continued improvement — including PGA professionals.'
	}
];

export const results: Pillar[] = [
	{ num: '01', icon: 'sparkle', title: 'High School State Champion', text: 'Coached a high school golfer to a State Championship.' },
	{
		num: '02',
		icon: 'pin',
		title: 'PGA Professional Development',
		text: 'Coached PGA professionals to improve their games — working with golfers across every skill level, including other golf professionals.'
	},
	{
		num: '03',
		icon: 'target',
		title: 'Personal Goals',
		text: 'Helped golfers achieve their individual goals — lowering handicap, improving scoring, becoming more consistent, or preparing for competition.'
	},
	{
		num: '04',
		icon: 'pulse',
		title: 'Player Development',
		text: 'From beginners to competitive players — coaching built around the individual golfer rather than a one-size-fits-all swing method.'
	}
];

export const whyTrey: Pillar[] = [
	{
		isNew: true,
		icon: 'cube',
		title: '3D Motion Capture',
		text: 'Trey now coaches with TrackMan’s newest 3D motion capture technology — combining ball flight data with full-body swing motion for a more complete picture of your game.'
	},
	{
		icon: 'sparkle',
		title: 'PGA Member & Certified',
		text: 'PGA Member with advanced certifications, including TrackMan University Level 2 and ADM certification — credentials most local instructors don’t hold.'
	},
	{
		icon: 'wrench',
		title: 'Certified Club Fitting',
		text: 'Master Club Fitter certified in Mizuno and Callaway, plus a certified Club Repair Technician — most instructors can’t fit or repair your equipment.'
	},
	{ icon: 'pulse', title: 'Player Development, Not Quick Fixes', text: 'Coaching is built around long-term improvement rather than isolated swing fixes.' },
	{
		icon: 'clock',
		title: 'Consistent & Flexible Scheduling',
		text: 'An indoor coaching bay at Dick’s House of Sport means lessons aren’t cancelled by weather, with scheduling that stays consistent week to week.'
	},
	{ icon: 'search', title: 'Practice With Purpose', text: 'Every lesson should give the golfer a clear direction for what to work on between sessions.' }
];
