-- Drill library seed, migrated from the `drills` array in legacy/index-trey-website.html (spec 3.F.2).
-- `default_minutes` is the legacy suggested time; a plan may use any minutes that make the session total exact.
alter table drills add column default_minutes integer check (default_minutes > 0);

insert into drills (name, category, purpose, setup, steps, cues, success_criteria, common_mistake, progression, regression, default_minutes)
select name, category, purpose, setup, steps, cues, success_criteria, common_mistake, progression, regression, default_minutes
from jsonb_to_recordset($seed$
[
 {
  "name": "Start Line Gate",
  "category": "Club Face Control",
  "purpose": "Train predictable start direction with clear external feedback.",
  "setup": "Place two alignment objects 10–15 yards ahead of the ball to form a start-line gate. Equipment: Two alignment sticks or spare clubs, golf balls, and a driver or 7-iron.",
  "steps": [
   "Hit shots through the gate.",
   "Keep the target line and club consistent while you observe each start direction."
  ],
  "cues": "Feel: Feel the clubface sending the ball through the window. Look: Picture a narrow window between two alignment sticks. Measure: Start at least 7 of 10 balls through a 3-yard gate.",
  "success_criteria": "7 out of 10 shots start through the gate.",
  "common_mistake": "Changing aim after every miss instead of keeping the target fixed.",
  "progression": "Narrow the gate or move it farther away.",
  "regression": "Widen the gate and move it closer.",
  "default_minutes": 10
 },
 {
  "name": "Low-Point Line Drill",
  "category": "Low Point Control",
  "purpose": "Improve where the club brushes the ground in relation to the ball.",
  "setup": "Draw or use an existing line on the turf. Place the ball on the line or just ahead of it. Equipment: A chalk line or visible turf line, a short iron such as an 8-iron, and golf balls.",
  "steps": [
   "Make small swings and observe where the club first contacts the ground.",
   "Keep the task about contact location."
  ],
  "cues": "Feel: Feel pressure move into the lead side as the club passes the ball. Look: Use a line on the ground as a reference for ball-first contact. Measure: Make 8 of 10 strikes with the divot or brush mark starting beyond the line.",
  "success_criteria": "8 of 10 ground marks start at or beyond the line.",
  "common_mistake": "Trying to lift the ball or making a large swing before contact is stable.",
  "progression": "Increase swing length or vary the target.",
  "regression": "Start with short chip-length swings and no ball.",
  "default_minutes": 9
 },
 {
  "name": "Centered Strike Feedback",
  "category": "Strike Quality / Centered Contact",
  "purpose": "Use clear feedback to move contact away from the heel or toe and toward the center of the face.",
  "setup": "Use the club that produces the miss. Apply face spray or impact tape. Start with a tee or short iron at half speed. Equipment: Face spray or impact tape, the club that produces the miss, and golf balls.",
  "steps": [
   "Hit one ball, inspect where it contacted the face, and make a small setup or swing-length adjustment.",
   "Repeat for 10 balls while keeping the target fixed."
  ],
  "cues": "Feel: Notice the sound and feel of a centered strike without changing several things at once. Look: Check the ball mark on the face after each shot. Measure: Make 6 of 10 strikes in the center third of the clubface.",
  "success_criteria": "At least 6 of 10 marks land in the center third of the face.",
  "common_mistake": "Changing aim, grip, and swing thought all at once after a heel strike.",
  "progression": "Use a longer club or a slightly faster swing after centered contact improves.",
  "regression": "Use a short iron, tee the ball, and make waist-high swings.",
  "default_minutes": 8
 },
 {
  "name": "Face-to-Path Window",
  "category": "Club Face Control",
  "purpose": "Explore how start direction and curvature respond to different deliveries.",
  "setup": "Choose a target line and a safe range. Use a mid-iron at comfortable speed. Equipment: A mid-iron, golf balls, and one clear target line.",
  "steps": [
   "Hit one shot at a time.",
   "Record start direction and curve independently; change only one intention at a time."
  ],
  "cues": "Feel: Notice the face-to-path relationship through impact. Look: Observe start direction first, then curve as a separate signal. Measure: Record start and curve for 10 shots; aim for 7 in the chosen window.",
  "success_criteria": "At least 7 of 10 shots finish in your chosen start-and-curve window.",
  "common_mistake": "Calling every right-curving ball the same fault without noting start direction.",
  "progression": "Tighten the window or use a different club.",
  "regression": "Work only on starting the ball through a wide gate.",
  "default_minutes": 10
 },
 {
  "name": "Wedge Landing-Spot Ladder",
  "category": "Wedge & Approach Distance Control",
  "purpose": "Build predictable carry distances and landing-spot control.",
  "setup": "Choose three safe landing zones at different distances. Use one wedge. Equipment: One wedge, golf balls, and three safe landing zones or markers.",
  "steps": [
   "Alternate between the three targets.",
   "Pause between balls and choose a fresh landing spot."
  ],
  "cues": "Feel: Feel the length and pace of the motion that sends the ball to each spot. Look: Pick a visible landing area and watch first bounce. Measure: Land 6 of 10 balls within a 5-yard zone.",
  "success_criteria": "6 of 10 balls land in the selected zone.",
  "common_mistake": "Hitting the same shot repeatedly without resetting the target.",
  "progression": "Randomize distances and change landing-zone size.",
  "regression": "Use one target with a wide landing area.",
  "default_minutes": 9
 },
 {
  "name": "Putting Pace Ladder",
  "category": "Putting — Speed Control",
  "purpose": "Train distance control and improve leave distance on longer putts.",
  "setup": "Choose a flat-ish putt 20–40 feet long. Place a tee or define a 3-foot finish circle. Equipment: A putter, golf balls, and a tee or marker for a 3-foot finish zone.",
  "steps": [
   "Hit putts to the finish zone without a hole target.",
   "Change distance after each attempt."
  ],
  "cues": "Feel: Let the stroke length set pace; keep the rhythm even. Look: Use a tee or fringe as a finish zone and compare each ball. Measure: Finish 7 of 10 putts inside a 3-foot circle.",
  "success_criteria": "7 of 10 balls finish inside the 3-foot circle.",
  "common_mistake": "Focusing on the cup instead of the distance the ball needs to travel.",
  "progression": "Vary distance and slope while retaining the finish zone.",
  "regression": "Shorten the putt and widen the zone.",
  "default_minutes": 10
 },
 {
  "name": "Random Target Transfer",
  "category": "Driver / Tee Shot Performance",
  "purpose": "Carry a skill into changing targets and club choices.",
  "setup": "Pick several targets and 2–3 clubs appropriate to the focus. Equipment: Two or three clubs, golf balls, and several safe targets.",
  "steps": [
   "Vary club and target.",
   "Rehearse, choose one intention, hit, then record the outcome."
  ],
  "cues": "Feel: Reset between shots and commit to the chosen intention. Look: Choose a new target line for every rep. Measure: Complete 8 different target/club combinations and grade each 1–5.",
  "success_criteria": "At least 6 of 8 attempts meet your target intention.",
  "common_mistake": "Hitting a rapid block of identical shots without a reset.",
  "progression": "Add consequence scoring or simulate course situations.",
  "regression": "Alternate between two easy targets with one club.",
  "default_minutes": 8
 },
 {
  "name": "Purposeful Warm-up",
  "category": "Tempo & Rhythm",
  "purpose": "Arrive ready to practice with balanced, comfortable movement.",
  "setup": "Begin with comfortable mobility and no ball. Use a club you can swing easily. Equipment: A wedge or short iron and golf balls.",
  "steps": [
   "Make 5 relaxed rehearsals, then hit 5 easy shots, holding the finish."
  ],
  "cues": "Feel: Find a smooth rhythm and finish each rehearsal in balance. Look: Use a simple setup reference and hold your finish for two seconds. Measure: Complete 10 balanced rehearsals before hitting balls.",
  "success_criteria": "Finish balanced and able to repeat your setup and rhythm.",
  "common_mistake": "Starting at full speed before you are ready.",
  "progression": "Add a longer club or more purposeful target.",
  "regression": "Use half swings and slow rehearsal motions.",
  "default_minutes": 5
 }
]
$seed$::jsonb) as d(
  name text, category text, purpose text, setup text, steps jsonb, cues text, success_criteria text,
  common_mistake text, progression text, regression text, default_minutes integer
)
on conflict (name) do nothing;
