export type Program = {
	id?: string;
	title: string;
	blurb: string;
	image: { src: string; alt: string; width: number; height: number };
	points: string[];
	cta: { label: string; href: string };
};

export const programs: Program[] = [
	{
		title: 'Golf Lessons',
		blurb: 'Personalized golf instruction designed around the individual player.',
		image: { src: '/images/img-04.jpg', alt: 'Golf lesson at sunset with alignment sticks', width: 800, height: 1066 },
		points: ['Better understanding', 'Better movement', 'Better ball striking', 'Better consistency', 'Greater confidence'],
		cta: { label: 'Learn More', href: '/golf-lessons-durham' }
	},
	{
		id: 'junior-card-anchor',
		title: 'Junior Golf',
		blurb: 'Fun, age-appropriate golf instruction designed to help young golfers learn the game, build confidence, and develop strong fundamentals.',
		image: { src: '/images/img-05.jpg', alt: 'Junior golfers practicing on the driving range', width: 800, height: 600 },
		points: ['Games', 'Variety', 'Simple coaching', 'Athletic movement', 'Confidence & learning to play golf'],
		cta: { label: 'Junior Golf', href: '#junior' }
	},
	{
		title: 'Player Development',
		blurb: 'A structured coaching approach connecting assessment, lessons, practice, and on-course performance.',
		image: { src: '/images/img-06.jpg', alt: 'Golf performance simulator and swing data analysis', width: 800, height: 600 },
		points: ['Assessment-driven priorities', 'A clear developmental pathway', 'Practice designed with purpose', 'On-course transfer'],
		cta: { label: 'Explore Player Development', href: '#development' }
	}
];
