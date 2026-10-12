export type PriceRow = { label: string; price: string };
export type PriceGroup = { heading?: string; rows: PriceRow[] };
export type PriceTab = { id: 'lessons' | 'youth'; label: string; groups: PriceGroup[] };

const pack = (a: string, b: string, c: string, d: string): PriceRow[] => [
	{ label: '1 Lesson', price: a },
	{ label: '3 Lessons', price: b },
	{ label: '6 Lessons', price: c },
	{ label: '10 Lessons', price: d }
];

/** Copy matches legacy/index.html #pricing. */
export const priceTabs: PriceTab[] = [
	{ id: 'lessons', label: 'Lessons', groups: [{ rows: pack('$79.99', '$219.99', '$399.99', '$599.99') }] },
	{
		id: 'youth',
		label: 'Youth Lessons',
		groups: [
			{ heading: 'Junior Lessons (Ages 13–18)', rows: pack('$49.99', '$129.99', '$229.99', '$329.99') },
			{ heading: 'Junior Lessons (Under 12)', rows: pack('$29.99', '$79.99', '$149.99', '$229.99') }
		]
	}
];

export const usKidsProgram = {
	badge: 'The Ultimate Youth Development Program',
	title: 'U.S. Kids Golf Program',
	price: '$500',
	points: ['20 lessons + 2 free (22 total)', 'Bi-weekly lessons for a full year', 'All U.S. Kids Golf program materials included']
} as const;

export type OnlineTier = {
	tag: string;
	title: string;
	price: string;
	priceSuffix?: string;
	description: string;
	features: string[];
	/** Email subject, unencoded. */
	subject: string;
	featured?: boolean;
};

export const onlineTiers: OnlineTier[] = [
	{
		tag: 'One-Time',
		title: 'Initial Performance Assessment',
		price: '$149',
		description: 'Identifies the root causes of your performance challenges and gives you a clear roadmap for improvement.',
		features: [
			'Player evaluation & goal-setting questionnaire',
			'Face-on and down-the-line video swing analysis',
			'30-minute Zoom consultation',
			'Detailed performance report',
			'Personalized practice plan'
		],
		subject: 'Initial Performance Assessment'
	},
	{
		tag: 'Ongoing',
		title: 'Golf Performance Coaching Membership',
		price: '$49',
		priceSuffix: '/month',
		description: 'Ongoing support, accountability, and progress tracking following your Initial Performance Assessment.',
		features: [
			'Unlimited video submissions & feedback (48-hour response)',
			'Coach check-ins every 10 days',
			'Practice plan updates as you improve',
			'Ongoing goal & skill tracking',
			'Direct coach access between check-ins'
		],
		subject: 'Golf Performance Coaching Membership',
		featured: true
	}
];
