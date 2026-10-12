export type FaqItem = {
	question: string;
	answer: string;
	/** Copy Trey still has to supply; rendered in the dashed placeholder box, as in legacy. */
	placeholder?: boolean;
};

/** Copy matches legacy/index.html #faq. */
export const faqItems: FaqItem[] = [
	{ question: 'Do you teach beginners?', answer: 'Yes. Trey works with complete beginners and adults learning the game for the first time.' },
	{ question: 'Do you teach junior golfers?', answer: 'Yes. Junior coaching is a major part of Trey’s business, including the U.S. Kids Golf program.' },
	{ question: 'Do you work with competitive high school golfers?', answer: 'Yes. Trey has coached a high school golfer to a State Championship and works with competitive junior golfers regularly.' },
	{ question: 'Do you coach PGA professionals?', answer: 'Yes. Trey has coached PGA professionals to improve their games, in addition to golfers of every other skill level.' },
	{ question: 'What happens during the first lesson?', answer: 'The process starts with a conversation about your goals and where your game is today, followed by an assessment of your current performance before deciding what to focus on.' },
	{ question: 'What is a Golf Performance Assessment?', answer: 'An evaluation of the golfer as a whole — ball flight, TrackMan data, contact, and player goals — used to identify the biggest opportunities for improvement and recommend a coaching path.' },
	{ question: 'How does TrackMan fit into a lesson?', answer: 'TrackMan provides objective data on things like club speed, launch, spin, and strike patterns. Trey uses that data to help you understand cause and effect, not just to hand you a list of numbers.' },
	{ question: 'How often should I take lessons?', answer: '[ADD INFORMATION]', placeholder: true },
	{ question: 'What should I bring to my lesson?', answer: '[ADD INFORMATION]', placeholder: true },
	{ question: 'Where are lessons located?', answer: 'Primarily at Dick’s House of Sport in Durham, NC. Trey also teaches periodically in Douglas, Wyoming.' },
	{ question: 'Do you offer lesson packages?', answer: 'Yes. Lesson packages are available in 1, 3, 6, and 10-lesson increments for both adults and juniors — see the pricing section above.' },
	{ question: 'Do you offer club fitting?', answer: 'Yes. Trey is a Master Club Fitter and Club Repair Technician with Callaway and Mizuno product knowledge and fitting certification.' },
	{ question: 'Can you help me build a practice plan?', answer: 'Yes. A personalized practice plan is part of the Golf Performance Assessment and the online coaching program.' },
	{ question: 'Do you offer coaching for golfers outside Durham?', answer: 'Yes. Trey teaches periodically in Douglas, Wyoming, offers private lessons upon request, and offers online coaching for golfers anywhere.' }
];
