export type Program = {
	id?: string;
	title: string;
	blurb: string;
	image: { name: string; alt: string };
	points: string[];
	cta: { label: string; href: string };
};

export const programs: Program[] = [
	{
		title: 'Golf Lessons',
		blurb: 'Personalized golf instruction designed around the individual player.',
		image: { name: 'img-04', alt: 'Golf lesson at sunset with alignment sticks' },
		points: ['Better understanding', 'Better movement', 'Better ball striking', 'Better consistency', 'Greater confidence'],
		cta: { label: 'Explore Golf Lessons', href: '/golf-lessons-durham' }
	},
	{
		id: 'junior-card-anchor',
		title: 'Junior Golf',
		blurb: 'Fun, age-appropriate golf instruction designed to help young golfers learn the game, build confidence, and develop strong fundamentals.',
		image: { name: 'img-05', alt: 'Junior golfers practicing on the driving range' },
		points: ['Games', 'Variety', 'Simple coaching', 'Athletic movement', 'Confidence & learning to play golf'],
		cta: { label: 'Junior Golf', href: '#junior' }
	},
	{
		title: 'Player Development',
		blurb: 'A structured coaching approach connecting assessment, lessons, practice, and on-course performance.',
		image: { name: 'img-06', alt: 'Golf performance simulator and swing data analysis' },
		points: ['Assessment-driven priorities', 'A clear developmental pathway', 'Practice designed with purpose', 'On-course transfer'],
		cta: { label: 'Explore Player Development', href: '#development' }
	}
];
