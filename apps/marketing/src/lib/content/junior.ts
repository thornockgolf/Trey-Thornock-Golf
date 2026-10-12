export const uskidsPoints: string[] = [
	'Age-appropriate skill development',
	'Fun, confidence, and positive habits first',
	'A full year of structured, bi-weekly coaching'
];

export const uskidsIncluded: string[] = [
	'20 lessons + 2 free (22 total)',
	'Bi-weekly lessons for a full year',
	'All U.S. Kids Golf program materials included'
];

export type JuniorStep = { tag: string; title: string; text: string };
export const juniorPathway: JuniorStep[] = [
	{ tag: 'Start', title: 'Discover Golf', text: 'A fun introduction to the game, basic fundamentals, and positive first experiences.' },
	{ tag: 'Develop', title: 'Build Skills', text: 'Ball striking, short game, putting, and practice habits that build real understanding.' },
	{ tag: 'Grow', title: 'Develop Independence', text: 'Learn how to practice, manage the course, and take ownership of improvement.' },
	{ tag: 'Compete', title: 'Prepare for Competition', text: 'For juniors who want to compete — course management and tournament preparation.' }
];

export type JuniorStart = { title: string; text: string; image: { src: string; alt: string; width: number; height: number } };
export const juniorStarts: JuniorStart[] = [
	{
		title: 'New to Golf',
		text: 'A fun introduction to the game.',
		image: { src: '/images/img-09.jpg', alt: 'Junior golfers getting set up with their clubs', width: 700, height: 933 }
	},
	{
		title: 'Building Skills',
		text: 'Develop fundamentals through games and purposeful practice.',
		image: { src: '/images/img-05.webp', alt: 'Junior golfers practicing swings on the range', width: 800, height: 600 }
	},
	{
		title: 'Learning to Play',
		text: 'Take skills from the range to the golf course.',
		image: { src: '/images/img-02.webp', alt: 'Coach and junior golfer walking the course together', width: 700, height: 933 }
	}
];

export const parentExpect: { title: string; text: string }[] = [
	{ title: 'A Clear Development Path', text: 'You’ll understand what your junior is working on and why.' },
	{ title: 'Positive Coaching', text: 'Building confidence while developing real golf skills.' },
	{ title: 'Age-Appropriate Instruction', text: 'Skills taught in a way that matches your junior’s experience.' },
	{ title: 'Progress You Can See', text: 'A clear sense of what’s improving and what comes next.' },
	{ title: 'A Love for the Game', text: 'The goal is a junior who enjoys golf and keeps playing.' }
];
