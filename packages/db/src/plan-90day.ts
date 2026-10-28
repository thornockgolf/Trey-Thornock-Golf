/**
 * The 90-day development plan, as data: three 30-day phases (movement patterns, skills, transfer to results), three
 * sessions a week, 39 lessons. DRAFT wording for Trey to review: edit the text here, then re-run `bun run db:seed-plan`
 * (drills that already exist by name are kept as they are; edit those in the coach library).
 *
 * Sessions refer to drills by name; `buildStructure` swaps names for ids when seeding. Lesson numbers are 1-based.
 */
import type { PlanPhase, PlanStructure, SessionLength } from '@ttg/shared';

export const PLAN_TITLE = '90-Day Development Plan';

/** Drills that migration 0007 already seeds (never re-inserted here). */
export const SEEDED_DRILL_NAMES = [
	'Start Line Gate',
	'Low-Point Line Drill',
	'Centered Strike Feedback',
	'Face-to-Path Window',
	'Wedge Landing-Spot Ladder',
	'Putting Pace Ladder',
	'Random Target Transfer',
	'Purposeful Warm-up'
] as const;

export interface DrillSeed {
	readonly name: string;
	readonly category: string;
	readonly purpose: string;
	readonly setup: string;
	readonly steps: readonly string[];
	readonly cues: string;
	readonly successCriteria: string;
	readonly commonMistake: string;
	readonly progression: string;
	readonly regression: string;
	readonly defaultMinutes: number;
}

/** New drills, same fields as the seeded library. */
export const NEW_DRILLS: readonly DrillSeed[] = [
	// ---- Phase 1: movement patterns -------------------------------------------------------------------------------
	{
		name: 'Grip Pressure Check',
		category: 'Setup Fundamentals',
		purpose: 'Build a neutral, light grip you can repeat, so the club can release instead of fighting your hands.',
		setup: 'Hold your 7-iron at address. Equipment: 7-iron, a mirror or phone camera.',
		steps: [
			'Set the club in the fingers of the lead hand so the "V" between thumb and forefinger points toward your trail shoulder.',
			'Add the trail hand so the lifeline of the palm covers the lead thumb.',
			'Squeeze as hard as you can, then back off to a 4 out of 10. Take 5 slow swings holding that pressure.',
			'Hit 5 balls at half speed keeping the same pressure, then check your grip in the mirror.'
		],
		cues: 'Feel: Hold the club like a bird you do not want to crush or let go. Look: Two to three knuckles of the lead hand visible at address. Measure: Your pressure stays about a 4 out of 10 at the top and through the ball on 4 of 5 swings.',
		successCriteria: '4 of 5 swings keep the same light pressure, and the grip looks the same in the mirror each time.',
		commonMistake: 'Squeezing harder at the top of the backswing or at the start of the downswing.',
		progression: 'Hit full 7-iron shots keeping the pressure, then try a driver.',
		regression: 'Make slow swings without a ball, then check the grip after each one.',
		defaultMinutes: 10
	},
	{
		name: 'Posture Mirror Hinge',
		category: 'Setup Fundamentals',
		purpose: 'Learn an athletic setup: hinge from the hips, flat back, soft knees, arms hanging.',
		setup: 'Stand side-on to a mirror or set your phone down the line. Equipment: club, mirror or phone camera.',
		steps: [
			'Hold the club across your hips and hinge back until your chest points at the ball.',
			'Soften the knees and let the arms hang under the shoulders.',
			'Check the video or mirror: back flat, weight in the middle of the feet.',
			'Set up to 5 balls, rebuilding the posture from standing each time.'
		],
		cues: 'Feel: Weight on the middle of your feet, bottom pushed back. Look: Straight line from head to tailbone, arms hanging. Measure: Match your posture photo on 4 of 5 setups.',
		successCriteria: '4 of 5 setups look the same on video, with a flat back and the arms hanging freely.',
		commonMistake: 'Bending from the waist and rounding the upper back instead of hinging at the hips.',
		progression: 'Add a half swing from each setup while holding the posture.',
		regression: 'Practice the hinge with the club across your hips and no ball.',
		defaultMinutes: 10
	},
	{
		name: 'Alignment Stick Station',
		category: 'Setup & Alignment',
		purpose: 'Check that aim, feet, hips and shoulders are square to the target so the swing is not working around a bad setup.',
		setup: 'Lay one stick on the ground pointing at the target and one along your toes. Equipment: two alignment sticks or spare clubs, golf balls.',
		steps: [
			'Place the first stick on the target line just outside the ball.',
			'Place the second parallel to it along your toes.',
			'Set up, then check shoulders, hips and forearms against the sticks.',
			'Hit 10 shots, resetting the sticks after any change.'
		],
		cues: 'Feel: Everything parallel left of the target, like train tracks. Look: Sticks, toes and shoulders all point the same way. Measure: Set up square on 8 of 10 balls with no change needed.',
		successCriteria: '8 of 10 setups are square when checked from behind.',
		commonMistake: 'Aiming the feet at the target and leaving the shoulders open.',
		progression: 'Remove the toe stick and repeat from memory, then check on camera.',
		regression: 'Use a shorter club and hit with the sticks in place.',
		defaultMinutes: 15
	},
	{
		name: 'One-Piece Takeaway Gates',
		category: 'Takeaway',
		purpose: 'Move the club, hands and chest away together so the club stays on a repeatable path.',
		setup: 'Two headcovers or tee-boxes set as a gate about a club-width apart, 18 inches behind the ball on the target line. Equipment: 2 headcovers, a 7-iron, balls.',
		steps: [
			'Without a ball, make 5 slow takeaways until the clubhead passes through the gate and stops at hip height.',
			'Check that the clubhead is outside the hands and the toe points up.',
			'Hit half shots, thinking only about the takeaway.',
			'Hit 10 balls at half speed, starting the swing with the gate checked.'
		],
		cues: 'Feel: Chest, arms and club start away together. Look: Clubhead passes through the gate without touching either cover. Measure: Clear the gate on 8 of 10 swings.',
		successCriteria: '8 of 10 takeaways pass through the gate cleanly.',
		commonMistake: 'Picking the club up with the hands or rolling the face open early.',
		progression: 'Move the gate wider and swing at 75% speed.',
		regression: 'Check the position in slow motion with no ball.',
		defaultMinutes: 15
	},
	{
		name: 'Half-Swing Checkpoints',
		category: 'Backswing & Transition',
		purpose: 'Learn the key positions of the backswing and start of the downswing in a small, controlled swing.',
		setup: 'Film down the line and face-on. Equipment: 8-iron, phone camera, balls.',
		steps: [
			'Make a swing from 9 o\'clock to 3 o\'clock (hands hip high both ways).',
			'Pause at the top. Check the lead arm is on the chest line and the club points down the line.',
			'Start down by shifting pressure to the lead foot before the arms move.',
			'Hit 10 balls with the same swing length, checking one position on video every 3 swings.'
		],
		cues: 'Feel: Turn the chest, let the arms follow. Look: Clubshaft parallel to the target line at the top. Measure: 7 of 10 swings land at the checkpoint without lifting or collapsing.',
		successCriteria: '7 of 10 swings hit the checkpoints on video.',
		commonMistake: 'Swinging only with the arms, so the shoulders never turn.',
		progression: 'Lengthen to a three-quarter swing keeping the same checkpoints.',
		regression: 'Make the swing slower and stop at the top for a count of two.',
		defaultMinutes: 15
	},
	{
		name: 'Pressure Shift Step Drill',
		category: 'Transition / Weight Shift',
		purpose: 'Feel the weight move into the lead side before the club reaches the ball, which is what brings the low point forward.',
		setup: 'Normal setup with the feet close together. Equipment: 7-iron, balls.',
		steps: [
			'At the top of a short backswing, step the lead foot toward the target as you start down.',
			'Let the arms and club follow the step, hitting the ball as the lead foot lands.',
			'Hit 5 balls with the step.',
			'Hit 5 more with the feet at normal width, keeping the same feeling of pressure moving forward.'
		],
		cues: 'Feel: Pressure on the inside of the lead foot before the arms drop. Look: Belt buckle facing the target at the finish. Measure: Hit the ball first on 7 of 10 shots.',
		successCriteria: '7 of 10 shots are ball-first, with the finish balanced on the lead foot.',
		commonMistake: 'Hanging back on the trail foot and flipping the hands at the ball.',
		progression: 'Take a normal-width stance with a full swing, keeping the same shift.',
		regression: 'Make step swings with no ball.',
		defaultMinutes: 15
	},
	{
		name: 'Impact Position Check',
		category: 'Impact',
		purpose: 'Rehearse a solid impact: hands ahead of the clubhead, lead wrist flat, chest turned slightly open.',
		setup: 'Place an impact bag, pillow or a towel on the ground to push into. Equipment: 7-iron, impact bag or towel, phone camera.',
		steps: [
			'Set up, swing slowly to the impact position, and press into the bag.',
			'Check on video that the lead wrist is flat and the hands are ahead of the ball.',
			'Hold for a count of two, then repeat 5 times.',
			'Hit 10 shots at half speed, trying to repeat that position.'
		],
		cues: 'Feel: Lead wrist flat, trail wrist bent back. Look: Hands ahead of the clubhead, chest slightly open. Measure: Match the impact photo on 3 of 5 rehearsals.',
		successCriteria: 'Your video matches the position on 3 of 5 rehearsals.',
		commonMistake: 'Flipping the wrists through the ball to scoop it into the air.',
		progression: 'Add speed gradually, checking contact with face spray.',
		regression: 'Slow rehearsals only, no ball.',
		defaultMinutes: 15
	},
	{
		name: 'Slow-Motion Rehearsals',
		category: 'Movement Patterns',
		purpose: 'Groove a new movement at a speed where you can feel it, before adding pace.',
		setup: 'Pick the one change from this session and rehearse it. Equipment: your working club, a mirror or phone.',
		steps: [
			'Make 5 swings at about 30% speed focusing on the one change.',
			'Make 5 at 50% speed.',
			'Hit 3 balls at 50% speed, keeping the same movement.',
			'Rehearse once more before each ball.'
		],
		cues: 'Feel: Smooth, with the new feel exaggerated. Look: Same position as the checkpoint video each time. Measure: At least 8 of 10 rehearsals feel the same.',
		successCriteria: '8 of 10 rehearsals match the feel and the video.',
		commonMistake: 'Going full speed too soon and reverting to the old pattern.',
		progression: 'Move up to 75% speed, then full.',
		regression: 'Slow down to 20% speed and stop at each checkpoint.',
		defaultMinutes: 10
	},
	{
		name: 'Video Checkpoint Review',
		category: 'Movement Patterns',
		purpose: 'See what you are doing, not just what you feel. Compare your swing to the checkpoints from your last lesson.',
		setup: 'Phone on a tripod down the line, then face-on. Equipment: phone, tripod, 7-iron, balls.',
		steps: [
			'Film 3 swings down the line and 3 face-on at 75% speed.',
			'Compare setup, takeaway, top and impact to the checkpoints.',
			'Pick the one thing that is closest to a miss and mark it.',
			'Upload the best clip to your library for Trey.'
		],
		cues: 'Feel: Calm and curious. Look: One change at a time. Measure: You can name one position that matches and one to work on.',
		successCriteria: 'You have uploaded at least one clean clip and written down one note.',
		commonMistake: 'Picking several changes at once instead of one.',
		progression: 'Compare with a clip from earlier in the plan.',
		regression: 'Film only down the line and look at one position.',
		defaultMinutes: 10
	},
	{
		name: 'Mechanics Checkpoint Test',
		category: 'Assessment',
		purpose: 'Measure the phase: do the new movement patterns hold up when you hit real shots?',
		setup: 'Use your 7-iron and a fixed target about 150 yards away. Equipment: 7-iron, face spray, alignment sticks, phone.',
		steps: [
			'Hit 10 shots through the gate (Start Line Gate set to 3 yards wide) and count the number that pass through.',
			'Hit 10 shots with face spray and count strikes in the centre third of the face.',
			'Film a swing down the line and face-on, then compare it to your first video.',
			'Write down the three numbers.'
		],
		cues: 'Feel: Relaxed, same routine every ball. Look: Score every shot honestly. Measure: Gate hits out of 10, centre-face strikes out of 10, and ball-first contact out of 10.',
		successCriteria: 'You beat your Lesson 1 numbers on at least two of the three counts.',
		commonMistake: 'Changing the swing during the test instead of just recording the result.',
		progression: 'Repeat the test with a driver.',
		regression: 'Cut the test to 5 shots per count.',
		defaultMinutes: 30
	},

	// ---- Phase 2: skills ------------------------------------------------------------------------------------------
	{
		name: 'Club Distance Gapping',
		category: 'Club & Pace Control',
		purpose: 'Know how far each club really carries, so you can pick the right club and commit.',
		setup: 'A range with distance markers or a launch monitor. Equipment: wedges, 8-iron, 6-iron, balls.',
		steps: [
			'Hit 5 balls with each club using a normal swing at 80% effort.',
			'Throw out the best and worst, then record the carry of the middle three.',
			'Write the average for each club.',
			'Check the gap between clubs is about 10 yards.'
		],
		cues: 'Feel: Same tempo with every club. Look: Pick a landing spot, not a pin. Measure: Carry spread of 10 yards or less across the middle three shots.',
		successCriteria: 'You have an average carry for each club with the middle three within 10 yards.',
		commonMistake: 'Counting the one flush shot as your number.',
		progression: 'Add 3 shots with a half-swing for each wedge.',
		regression: 'Check only three clubs.',
		defaultMinutes: 25
	},
	{
		name: 'Tempo Count Swings',
		category: 'Tempo & Rhythm',
		purpose: 'Use a steady count so swing speed changes without changing rhythm.',
		setup: 'Pick a pace of 3 counts back, 1 count down ("one-two-three, hit"). Equipment: 7-iron, metronome app if you like, balls.',
		steps: [
			'Hit 5 balls at 70% speed on the 3:1 count.',
			'Hit 5 at 85% speed on the same count.',
			'Hit 5 at 100% speed on the same count.',
			'Compare the carry distance for each group.'
		],
		cues: 'Feel: Same rhythm, bigger swing. Look: Finish balanced for a count of three. Measure: Three distinct carry distances with at least 10 yards between groups.',
		successCriteria: 'Each speed group lands within about 5 yards of its own average.',
		commonMistake: 'Speeding up the downswing when asked for more distance.',
		progression: 'Switch clubs between swings.',
		regression: 'Count aloud while making practice swings.',
		defaultMinutes: 15
	},
	{
		name: 'Short Putt Gate',
		category: 'Putting - Start Line',
		purpose: 'Hole more putts from 3 to 6 feet by starting the ball on the line you picked.',
		setup: 'Two tees just wider than the ball placed 12 inches in front of it. Equipment: putter, 2 tees, 5 balls.',
		steps: [
			'Putt from 3 feet through the gate. Make 5 in a row, then move to 4 feet.',
			'Move to 5 feet, then 6 feet.',
			'If you miss, start over at that distance.',
			'Finish with 5 putts with no gate.'
		],
		cues: 'Feel: Smooth stroke, head still until the ball is gone. Look: Ball passes through the gate. Measure: 5 in a row from 3 and 4 feet, 3 of 5 from 5 and 6 feet.',
		successCriteria: '5 in a row from 3 and 4 feet, and 3 of 5 from 5 feet.',
		commonMistake: 'Peeking to see if it went in.',
		progression: 'Use a narrower gate or longer distance.',
		regression: 'Putt from 2 feet until the stroke feels easy.',
		defaultMinutes: 15
	},
	{
		name: 'Wedge Distance Clock',
		category: 'Wedge & Approach Distance Control',
		purpose: 'Build three repeatable wedge swing lengths (clock positions) so you have a number for every distance inside 100 yards.',
		setup: 'Targets at 30, 50, 70 yards. Equipment: sand or lob wedge, balls, targets or towels.',
		steps: [
			'Hit 5 balls with a 7:30 to 4:30 swing (hands hip high) and record the average carry.',
			'Repeat with a 9:00 to 3:00 swing, and then a 10:30 to 1:30 swing.',
			'Write the three distances on a card.',
			'Hit 3 shots to each target using the matching swing.'
		],
		cues: 'Feel: Same rhythm, longer swing. Look: Chest turns with the arms. Measure: 6 of 9 shots land within 5 yards of the target distance.',
		successCriteria: '6 of 9 shots finish within 5 yards of the target.',
		commonMistake: 'Decelerating on shorter shots.',
		progression: 'Add a fourth swing length or a different wedge.',
		regression: 'Use only the 9:00 swing and a big target.',
		defaultMinutes: 20
	},
	{
		name: 'Chip Landing Zone Targets',
		category: 'Short Game Accuracy',
		purpose: 'Pick a landing spot and land the ball there so rollout is predictable.',
		setup: 'A towel on the green as a landing spot, 3 to 5 feet onto the green, with the hole 10 to 15 feet beyond it. Equipment: 8-iron, wedge, 10 balls, 1 towel.',
		steps: [
			'Chip 5 balls with an 8-iron aiming to land on the towel.',
			'Chip 5 more with a wedge and compare the rollout.',
			'Move the towel closer or farther and repeat.',
			'Count the balls that land on the towel or stop within 3 feet of the hole.'
		],
		cues: 'Feel: Quiet hands, chest turns through. Look: At the towel, not the hole. Measure: 6 of 10 land on the towel.',
		successCriteria: '6 of 10 chips land on the towel, and the rollout looks consistent.',
		commonMistake: 'Looking at the hole instead of the landing spot.',
		progression: 'Use a smaller landing target.',
		regression: 'Move the towel closer and use a bigger one.',
		defaultMinutes: 20
	},
	{
		name: 'Bunker Splash Line',
		category: 'Short Game Accuracy',
		purpose: 'Enter the sand the same distance behind the ball every time so bunker shots exit predictably.',
		setup: 'Draw a line in the sand and play the ball off its front end. Equipment: sand wedge, rake, balls.',
		steps: [
			'Draw a line and put the ball just ahead of it.',
			'Open the face slightly and swing so the club enters on the line.',
			'Hit 5 shots, checking whether the line is cut in the sand.',
			'Hit 5 shots with the ball and no line, keeping the same entry point.'
		],
		cues: 'Feel: Club slides under the ball. Look: Sand cut starts at the line. Measure: 7 of 10 shots exit the bunker, 5 of 10 land within 15 feet of the target.',
		successCriteria: '7 of 10 shots leave the bunker with the entry point on the line.',
		commonMistake: 'Hitting at the ball instead of the sand.',
		progression: 'Vary the lie, then vary the distance.',
		regression: 'Use a bigger target and a flat lie.',
		defaultMinutes: 15
	},
	{
		name: 'Fairway Window Tee Shots',
		category: 'Driver / Tee Shot Performance',
		purpose: 'Find the fairway more often by picking a start line and a shape you trust.',
		setup: 'Pick a fairway on the range or draw a 30-yard-wide window using flags. Equipment: driver, 3-wood, alignment sticks, balls.',
		steps: [
			'Choose a shot shape you trust (a gentle fade or draw).',
			'Pick a starting line and an intermediate target a few feet in front of the ball.',
			'Hit 10 drivers, scoring each as in or out of the window.',
			'If you miss twice on the same side, switch to the 3-wood.'
		],
		cues: 'Feel: Smooth tempo, balanced finish. Look: The window, not the trouble. Measure: 6 of 10 balls finish in the 30-yard window.',
		successCriteria: '6 of 10 tee shots finish in the window.',
		commonMistake: 'Swinging harder on the last few.',
		progression: 'Narrow the window to 25 yards or play both shapes.',
		regression: 'Widen the window and use the 3-wood.',
		defaultMinutes: 25
	},
	{
		name: 'Skills Benchmark Test',
		category: 'Assessment',
		purpose: 'Measure the phase: club and pace control, short-game accuracy and fairways hit.',
		setup: 'Four stations, run them in order. Equipment: driver, wedge, putter, 20 balls, targets.',
		steps: [
			'Tee shots: 10 drivers, count balls in a 30-yard window.',
			'Wedge distance: 5 balls to a 50-yard target, count those within 5 yards.',
			'Chipping: 5 balls to a 10-foot circle, count those that finish in it.',
			'Putting: 5 from 3 feet and 5 lag putts from 30 feet, count makes and those finishing within 3 feet.'
		],
		cues: 'Feel: Same routine on every ball. Look: Score honestly. Measure: Write down the counts for each station.',
		successCriteria: 'Your numbers have improved on at least three of the four stations compared to Lesson 14.',
		commonMistake: 'Practising during the test.',
		progression: 'Repeat with a second set of targets.',
		regression: 'Cut each station to 5 balls.',
		defaultMinutes: 40
	},

	// ---- Phase 3: transfer to results -----------------------------------------------------------------------------
	{
		name: 'Closest-to-Pin Challenge',
		category: 'Competition Practice',
		purpose: 'Practise with a score and a winner so every shot matters.',
		setup: 'Pick 3 targets at 60, 100 and 140 yards. Equipment: wedges, 8-iron, balls, a partner or your own best score.',
		steps: [
			'Hit one ball to each target. Score 3 points for inside 10 feet, 2 for inside 20 feet and 1 for on the green.',
			'Play 9 rounds (27 shots).',
			'Record your total score.',
			'Write the total down and try to beat it next session.'
		],
		cues: 'Feel: Commit to the target. Look: Pick a precise landing spot. Measure: Total points out of 81.',
		successCriteria: 'You beat your previous best score or hold it two sessions in a row.',
		commonMistake: 'Rushing after a poor shot.',
		progression: 'Add a consequence: miss the green and you start the round over.',
		regression: 'Use bigger scoring zones.',
		defaultMinutes: 25
	},
	{
		name: 'Pre-Shot Routine Under Pressure',
		category: 'Competition Practice',
		purpose: 'Keep the same routine when the shot matters, so you do not rush or freeze.',
		setup: 'Write down your routine in 4 steps (see, plan, rehearse, go). Equipment: any club, balls, a scorecard.',
		steps: [
			'Run the full routine on every ball.',
			'Hit 10 shots at a target and tick each one where you followed your routine.',
			'Add pressure: if you break your routine, you restart the round.',
			'Hit 10 more with a score to beat.'
		],
		cues: 'Feel: One deep breath, then commit. Look: Same routine length every time. Measure: Routine done on 9 of 10 balls.',
		successCriteria: 'You follow the routine on 9 of 10 balls, even with a score on the line.',
		commonMistake: 'Skipping the routine after a bad shot.',
		progression: 'Add a time limit or an audience.',
		regression: 'Cut the routine to three steps.',
		defaultMinutes: 25
	},
	{
		name: 'Must-Make Putting Ladder',
		category: 'Competition Practice',
		purpose: 'Practise putting with consequences, like a real match.',
		setup: 'Place tees at 3, 4, 5 and 6 feet in a circle around a hole. Equipment: putter, 4 balls, tees.',
		steps: [
			'Putt from 3 feet, and move to the next distance only after you make it.',
			'If you miss, go back one step.',
			'Reach 6 feet and make 2 in a row to finish.',
			'Count how many putts it took. Try to beat your score.'
		],
		cues: 'Feel: Same stroke and routine. Look: A small target. Measure: Total putts to finish.',
		successCriteria: 'You complete the ladder in 20 putts or fewer, then in fewer next time.',
		commonMistake: 'Quitting the routine after a miss.',
		progression: 'Add a distance or require 3 in a row.',
		regression: 'Take a ladder of 2, 3 and 4 feet.',
		defaultMinutes: 15
	},
	{
		name: 'Up-and-Down Challenge',
		category: 'Competition Practice',
		purpose: 'Practise the shot that saves pars, with the pressure of a real score.',
		setup: 'Nine spots around the green with different lies. Equipment: wedges, putter, balls.',
		steps: [
			'Play each spot with one ball and putt out.',
			'Score 1 if you get up-and-down, 0 if not.',
			'Record your total out of 9.',
			'Play again and try to beat your total.'
		],
		cues: 'Feel: Pick the landing spot, then the putt. Look: Read the green on the way. Measure: Up-and-downs out of 9.',
		successCriteria: 'You get 4 or more up-and-downs out of 9.',
		commonMistake: 'Picking a shot that is too ambitious.',
		progression: 'Make the lies harder.',
		regression: 'Take away the hardest 3 spots.',
		defaultMinutes: 30
	},
	{
		name: 'Range Nine',
		category: 'On-Course Simulation',
		purpose: 'Play nine imaginary holes on the range so you practise the shots in the order you would hit them on the course.',
		setup: 'Pick targets for tee shot, approach and wedge. Equipment: driver, an iron, a wedge, balls, a scorecard.',
		steps: [
			'Hit a tee shot with the driver and score it fairway or miss.',
			'Hit an approach to a green target and score green or miss.',
			'If you miss the green, hit a chip or pitch and score a par save.',
			'Play 9 holes, recording your score as if it were a round.'
		],
		cues: 'Feel: Treat each ball as the only ball. Look: Imagine the hole. Measure: Fairways hit, greens hit and your simulated score.',
		successCriteria: 'You finish the nine with a simulated score within 2 of your goal.',
		commonMistake: 'Hitting a second ball when you miss.',
		progression: 'Add hazards or a different order of clubs.',
		regression: 'Play six holes.',
		defaultMinutes: 40
	},
	{
		name: 'Short Game Nine',
		category: 'On-Course Simulation',
		purpose: 'Play nine short-game holes on the practice green for a total score.',
		setup: 'Nine holes of different length, lie and slope. Equipment: wedges, putter, balls, scorecard.',
		steps: [
			'Play each as one ball from the start spot to the hole.',
			'Count strokes until it is holed.',
			'Add all nine scores.',
			'Par is 18 (two strokes a hole). Try to beat your last total.'
		],
		cues: 'Feel: Commit to one shot. Look: Read the break. Measure: Total strokes out of 9 holes.',
		successCriteria: 'Your total is 20 or fewer.',
		commonMistake: 'Re-hitting a bad shot.',
		progression: 'Make the holes longer or the lies harder.',
		regression: 'Play six holes.',
		defaultMinutes: 40
	},
	{
		name: 'Fairway Finder Challenge',
		category: 'Competition Practice',
		purpose: 'Hit tee shots under pressure when you need to find the fairway.',
		setup: 'Use a 30-yard fairway window. Equipment: driver, 3-wood, balls.',
		steps: [
			'Play 10 imaginary tee shots. Choose the club you would play on the course.',
			'Score a point for each ball in the window.',
			'If you miss twice in a row, you must hit a 3-wood next.',
			'Beat your best score.'
		],
		cues: 'Feel: Commit to the club. Look: The window. Measure: Fairways hit out of 10.',
		successCriteria: '7 of 10 balls finish in the window.',
		commonMistake: 'Changing the target after a miss.',
		progression: 'Narrow the window to 25 yards.',
		regression: 'Widen the window.',
		defaultMinutes: 25
	},
	{
		name: 'Match Play Practice Game',
		category: 'Competition Practice',
		purpose: 'Practise against someone, or against a par score, with a win or a loss.',
		setup: 'Pick 9 shots from around the green and range. Equipment: wedges, irons, putter, balls, a partner.',
		steps: [
			'Play nine holes of match play on the practice area with a partner.',
			'Each hole is a different shot, with the closer to the target winning.',
			'Keep score in holes.',
			'Loser sets the next challenge.'
		],
		cues: 'Feel: Play your own game. Look: One shot at a time. Measure: Holes won out of 9.',
		successCriteria: 'You win or halve at least 5 of 9 holes.',
		commonMistake: 'Getting angry after a loss.',
		progression: 'Play for something small.',
		regression: 'Play against par, not a partner.',
		defaultMinutes: 55
	},
	{
		name: 'Course Play: Score It',
		category: 'On-Course Simulation',
		purpose: 'Take everything to the course: play holes with a goal, a routine and a score.',
		setup: 'Play 6 holes on the course with two balls (second ball allowed only on tee shots). Equipment: full set, scorecard.',
		steps: [
			'Set a goal: for example, 3 fairways, 2 greens and no double bogeys.',
			'Play each shot with your pre-shot routine.',
			'Keep score and note fairways, greens and putts.',
			'After the round, write one thing that went well and one to work on.'
		],
		cues: 'Feel: Stay in the present shot. Look: Your goal for the hole. Measure: Fairways, greens, up-and-downs and score.',
		successCriteria: 'You meet your goal for the round and used your routine on every shot.',
		commonMistake: 'Letting a bad hole change your plan.',
		progression: 'Play nine holes or play a tougher set of tees.',
		regression: 'Play three holes.',
		defaultMinutes: 85
	},
	{
		name: 'Transfer Benchmark Test',
		category: 'Assessment',
		purpose: 'Measure the phase: do your skills hold up under scoring and pressure?',
		setup: 'Run the three games in order. Equipment: driver, irons, wedges, putter, balls, scorecard.',
		steps: [
			'Fairway Finder: 10 tee shots, count balls in the window.',
			'Closest-to-Pin: 9 shots, total your points.',
			'Up-and-Down: 9 spots, count the saves.',
			'Compare your numbers with your first Phase 3 sessions.'
		],
		cues: 'Feel: Same routine, no excuses. Look: Honest scoring. Measure: Fairways, points and up-and-downs.',
		successCriteria: 'You improved on at least two of the three scores versus your first attempt.',
		commonMistake: 'Practising during the test.',
		progression: 'Repeat on the course.',
		regression: 'Cut each game to 5 shots.',
		defaultMinutes: 40
	}
];

export const PHASES: readonly PlanPhase[] = [
	{
		id: 'movement',
		title: 'Movement patterns',
		description:
			'Everything good in golf starts with how you move. For the next 30 days we rebuild your setup, takeaway, weight shift and impact so the club does the same thing every time. Go slow, trust the process, and film your swing often. Fast swings come later.',
		measure: 'Start-line gate hits, centre-face strikes and ball-first contact out of 10, plus a before/after video.',
		fromLesson: 1,
		toLesson: 13
	},
	{
		id: 'skills',
		title: 'Skills',
		description:
			'Now that you move well, we turn it into control. These 30 days are about hitting the right distance, landing it where you looked, and putting it in play off the tee. This is where scores start to drop.',
		measure: 'Fairways hit, wedge distance within 5 yards, chips holed or inside 3 feet, and short putts holed.',
		fromLesson: 14,
		toLesson: 26
	},
	{
		id: 'transfer',
		title: 'Transfer to results',
		description:
			'A great range session means nothing if it disappears on the first tee. For the last 30 days we practise with scores, consequences, pressure and the feel of a real round, so what you built shows up when it counts.',
		measure: 'Scored games (closest-to-pin points, up-and-downs, fairways hit) and your score on the course.',
		fromLesson: 27,
		toLesson: 39
	}
];

type S = readonly [drill: string, minutes: number];
interface SessionSeed {
	readonly title: string;
	readonly durationMin: SessionLength;
	readonly drills: readonly S[];
}

const WARM = 'Purposeful Warm-up';

/** Lessons 1-39, in order. Each phase ends with a lighter consolidation or test session. */
export const SESSIONS: readonly SessionSeed[] = [
	// Phase 1: movement patterns (1-13)
	{ title: 'Setup basics: grip and posture', durationMin: 60, drills: [[WARM, 5], ['Grip Pressure Check', 15], ['Posture Mirror Hinge', 15], ['Alignment Stick Station', 15], ['Start Line Gate', 10]] },
	{ title: 'Aim and alignment', durationMin: 45, drills: [[WARM, 5], ['Alignment Stick Station', 15], ['Start Line Gate', 15], ['Centered Strike Feedback', 10]] },
	{ title: 'Grip and strike', durationMin: 45, drills: [[WARM, 5], ['Grip Pressure Check', 10], ['Centered Strike Feedback', 15], ['Slow-Motion Rehearsals', 15]] },
	{ title: 'One-piece takeaway', durationMin: 60, drills: [[WARM, 5], ['One-Piece Takeaway Gates', 20], ['Slow-Motion Rehearsals', 15], ['Video Checkpoint Review', 10], ['Start Line Gate', 10]] },
	{ title: 'Backswing to the top', durationMin: 45, drills: [[WARM, 5], ['One-Piece Takeaway Gates', 10], ['Half-Swing Checkpoints', 20], ['Video Checkpoint Review', 10]] },
	{ title: 'Takeaway to contact', durationMin: 60, drills: [[WARM, 5], ['Half-Swing Checkpoints', 15], ['Centered Strike Feedback', 15], ['Low-Point Line Drill', 15], ['Start Line Gate', 10]] },
	{ title: 'Pressure shift into the lead side', durationMin: 60, drills: [[WARM, 5], ['Pressure Shift Step Drill', 20], ['Low-Point Line Drill', 15], ['Slow-Motion Rehearsals', 10], ['Centered Strike Feedback', 10]] },
	{ title: 'Low point control', durationMin: 45, drills: [[WARM, 5], ['Low-Point Line Drill', 15], ['Pressure Shift Step Drill', 15], ['Centered Strike Feedback', 10]] },
	{ title: 'Impact position', durationMin: 60, drills: [[WARM, 5], ['Impact Position Check', 20], ['Low-Point Line Drill', 15], ['Face-to-Path Window', 10], ['Video Checkpoint Review', 10]] },
	{ title: 'Face and path', durationMin: 60, drills: [[WARM, 5], ['Face-to-Path Window', 20], ['Start Line Gate', 15], ['Impact Position Check', 10], ['Centered Strike Feedback', 10]] },
	{ title: 'Putting the pattern together', durationMin: 45, drills: [[WARM, 5], ['Half-Swing Checkpoints', 10], ['Pressure Shift Step Drill', 10], ['Face-to-Path Window', 10], ['Video Checkpoint Review', 10]] },
	{ title: 'Full-swing pattern', durationMin: 60, drills: [[WARM, 5], ['Slow-Motion Rehearsals', 10], ['Half-Swing Checkpoints', 10], ['Low-Point Line Drill', 10], ['Start Line Gate', 10], ['Centered Strike Feedback', 15]] },
	{ title: 'Phase 1 checkpoint', durationMin: 45, drills: [[WARM, 5], ['Mechanics Checkpoint Test', 30], ['Video Checkpoint Review', 10]] },

	// Phase 2: skills (14-26)
	{ title: 'Know your distances', durationMin: 60, drills: [[WARM, 5], ['Club Distance Gapping', 25], ['Tempo Count Swings', 15], ['Wedge Landing-Spot Ladder', 15]] },
	{ title: 'Tempo and speed control', durationMin: 45, drills: [[WARM, 5], ['Tempo Count Swings', 20], ['Club Distance Gapping', 10], ['Putting Pace Ladder', 10]] },
	{ title: 'Putting pace and start line', durationMin: 45, drills: [[WARM, 5], ['Putting Pace Ladder', 20], ['Short Putt Gate', 20]] },
	{ title: 'Wedge distances', durationMin: 60, drills: [[WARM, 5], ['Wedge Distance Clock', 25], ['Wedge Landing-Spot Ladder', 20], ['Putting Pace Ladder', 10]] },
	{ title: 'Chip landing spots', durationMin: 45, drills: [[WARM, 5], ['Chip Landing Zone Targets', 25], ['Putting Pace Ladder', 15]] },
	{ title: 'Finding the fairway', durationMin: 60, drills: [[WARM, 5], ['Fairway Window Tee Shots', 25], ['Start Line Gate', 15], ['Tempo Count Swings', 15]] },
	{ title: 'Bunkers and pitching', durationMin: 60, drills: [[WARM, 5], ['Bunker Splash Line', 20], ['Chip Landing Zone Targets', 20], ['Wedge Distance Clock', 15]] },
	{ title: 'Approach distance control', durationMin: 60, drills: [[WARM, 5], ['Wedge Distance Clock', 15], ['Wedge Landing-Spot Ladder', 15], ['Random Target Transfer', 15], ['Club Distance Gapping', 10]] },
	{ title: 'Short putts and lag putts', durationMin: 45, drills: [[WARM, 5], ['Short Putt Gate', 15], ['Putting Pace Ladder', 15], ['Chip Landing Zone Targets', 10]] },
	{ title: 'Driver and tee shots', durationMin: 60, drills: [[WARM, 5], ['Fairway Window Tee Shots', 25], ['Random Target Transfer', 15], ['Tempo Count Swings', 15]] },
	{ title: 'Short-game accuracy', durationMin: 60, drills: [[WARM, 5], ['Chip Landing Zone Targets', 20], ['Bunker Splash Line', 15], ['Wedge Distance Clock', 10], ['Short Putt Gate', 10]] },
	{ title: 'Skills mix', durationMin: 45, drills: [[WARM, 5], ['Fairway Window Tee Shots', 15], ['Wedge Distance Clock', 15], ['Putting Pace Ladder', 10]] },
	{ title: 'Phase 2 skills test', durationMin: 45, drills: [[WARM, 5], ['Skills Benchmark Test', 40]] },

	// Phase 3: transfer to results (27-39)
	{ title: 'Playing for points', durationMin: 60, drills: [[WARM, 5], ['Closest-to-Pin Challenge', 25], ['Random Target Transfer', 15], ['Pre-Shot Routine Under Pressure', 15]] },
	{ title: 'Routine under pressure', durationMin: 45, drills: [[WARM, 5], ['Pre-Shot Routine Under Pressure', 25], ['Start Line Gate', 15]] },
	{ title: 'Putting with consequences', durationMin: 45, drills: [[WARM, 5], ['Must-Make Putting Ladder', 25], ['Putting Pace Ladder', 15]] },
	{ title: 'Short-game scoring', durationMin: 60, drills: [[WARM, 5], ['Up-and-Down Challenge', 30], ['Closest-to-Pin Challenge', 25]] },
	{ title: 'Range nine', durationMin: 60, drills: [[WARM, 5], ['Range Nine', 55]] },
	{ title: 'Tee shots under pressure', durationMin: 45, drills: [[WARM, 5], ['Fairway Finder Challenge', 25], ['Pre-Shot Routine Under Pressure', 15]] },
	{ title: 'Short game nine', durationMin: 60, drills: [[WARM, 5], ['Short Game Nine', 40], ['Must-Make Putting Ladder', 15]] },
	{ title: 'Match play day', durationMin: 60, drills: [[WARM, 5], ['Match Play Practice Game', 55]] },
	{ title: 'On the course', durationMin: 90, drills: [[WARM, 5], ['Course Play: Score It', 85]] },
	{ title: 'Pressure mix', durationMin: 60, drills: [[WARM, 5], ['Up-and-Down Challenge', 20], ['Must-Make Putting Ladder', 15], ['Fairway Finder Challenge', 20]] },
	{ title: 'Range nine, scored', durationMin: 60, drills: [[WARM, 5], ['Range Nine', 40], ['Pre-Shot Routine Under Pressure', 15]] },
	{ title: 'On the course, round two', durationMin: 90, drills: [[WARM, 5], ['Course Play: Score It', 85]] },
	{ title: 'Phase 3 transfer test', durationMin: 45, drills: [[WARM, 5], ['Transfer Benchmark Test', 40]] }
];

/** Where session `index` (0-based) falls: Mon/Wed/Fri-style, three a week, as day offsets from the start date. */
const WEEK_PATTERN = [0, 2, 4] as const;
export const dayOffset = (index: number) => Math.floor(index / 3) * 7 + WEEK_PATTERN[index % 3]!;

/** `YYYY-MM-DD` dates for every session, from a start date (UTC arithmetic like `addDays`). Null if the start is not a real date. */
export const sessionDates = (startsOn: string, addDays: (d: string, n: number) => string | null): string[] | null => {
	const dates = SESSIONS.map((_, i) => addDays(startsOn, dayOffset(i)));
	return dates.some((d) => d === null) ? null : (dates as string[]);
};

/** The plan structure with drill names swapped for the ids in `idByName`. Throws on an unknown drill name. */
export const buildStructure = (idByName: ReadonlyMap<string, string>): PlanStructure => ({
	v: 1,
	phases: PHASES,
	sessions: SESSIONS.map((s) => ({
		title: s.title,
		durationMin: s.durationMin,
		items: s.drills.map(([name, minutes]) => {
			const drillId = idByName.get(name);
			if (!drillId) throw new Error(`Unknown drill "${name}" in session "${s.title}"`);
			return { drillId, minutes };
		})
	}))
});
