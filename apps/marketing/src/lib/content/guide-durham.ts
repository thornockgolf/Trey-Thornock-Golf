/** Copy for the Durham guide page, verbatim from legacy/golf-lessons-durham.html. */
export type GuideProgram = { title: string; body: string };
export type GuideStep = { title: string; body: string };
export type GuideFaq = { question: string; answer: string };

export const durhamPrograms: GuideProgram[] = [
	{
		title: 'Private Golf Lessons',
		body: 'One-on-one PGA instruction at Dick’s House of Sport, tailored to your swing, your goals, and where your game is today — not a generic lesson plan.'
	},
	{
		title: 'Beginner Golf Lessons',
		body: 'A strong foundation for golfers who are brand new to the game — fundamentals, setup, and how to practice effectively from day one.'
	},
	{
		title: 'Adult Golf Lessons',
		body: 'For recreational and competitive adult golfers looking to break through a plateau, get more consistent, and turn better practice into lower scores.'
	},
	{
		title: 'Junior Golf Lessons',
		body: 'Age-appropriate coaching, including the U.S. Kids Golf program, that builds fundamentals, confidence, and a lasting love for the game.'
	}
];

export const lessonSteps: GuideStep[] = [
	{ title: 'Connect', body: 'Trey starts by understanding your goals and where your game is today.' },
	{
		title: 'Assess',
		body: 'Your current performance is observed — using TrackMan data and video where helpful — before deciding what needs attention.'
	},
	{
		title: 'Focus',
		body: 'Together you identify the one priority that will make the biggest difference, instead of changing everything at once.'
	},
	{ title: 'Train', body: 'Simple instruction and purposeful practice, built around that priority.' },
	{ title: 'Transfer', body: 'You take the new skill from the lesson bay to the golf course.' },
	{ title: 'Plan', body: 'You leave knowing exactly what to work on before your next lesson.' }
];

export const getStartedSteps: GuideStep[] = [
	{
		title: 'Schedule Your Golf Performance Assessment',
		body: 'Book your first session directly through the scheduling link, or reach out with any questions first.'
	},
	{
		title: 'Complete Your Assessment',
		body: 'Trey evaluates your game as a whole and recommends a coaching path and development priorities.'
	},
	{
		title: 'Begin Lessons',
		body: 'Start private lessons, junior coaching, or online coaching — each lesson building on the one before it.'
	}
];

export const durhamFaqs: GuideFaq[] = [
	{
		question: 'Do you teach beginners?',
		answer:
			'Yes. Trey works with complete beginners and adults learning the game for the first time, building fundamentals and good practice habits from day one.'
	},
	{
		question: 'Do you offer junior golf lessons in Durham?',
		answer:
			'Yes. Junior coaching, including the U.S. Kids Golf program, is a major part of Trey Thornock Golf, with age-appropriate instruction for juniors at every stage.'
	},
	{
		question: 'What is a Golf Performance Assessment?',
		answer:
			'An evaluation of the golfer as a whole — ball flight, TrackMan data, contact, and player goals — used to identify the biggest opportunities for improvement and recommend a coaching path.'
	},
	{
		question: 'Where are golf lessons located?',
		answer:
			'Primarily at Dick’s House of Sport in Durham, NC (The Streets at Southpoint). Trey also offers online coaching and private lessons beyond Durham upon request.'
	},
	{
		question: 'Do you offer lessons for golfers outside Durham, like Raleigh or Cary?',
		answer:
			'Yes. Many golfers throughout the Triangle — including Raleigh, Cary, and Chapel Hill — drive to Durham for lessons, and online coaching is available for golfers anywhere.'
	},
	{
		question: 'Do you offer club fitting along with lessons?',
		answer:
			'Yes. Trey is a Master Club Fitter and Club Repair Technician with Callaway and Mizuno product knowledge and fitting certification.'
	}
];
