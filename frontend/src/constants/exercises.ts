// src/constants/exercises.ts
// GainTrack exercise database — strength / cardio / bodyweight / Olympic / stretching
// Each entry maps directly to the Exercise interface from src/types/index.ts

import { Exercise } from '../types';

// ─── Muscle-group filter chips (order matters for UI) ─────────────────────
export const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Legs',
  'Glutes',
  'Hamstrings',
  'Calves',
  'Cardio',
  'Full Body',
  'Olympic',
  'Stretching',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

// ─── Equipment filter options ─────────────────────────────────────────────
export const EQUIPMENT_TYPES = [
  'All',
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bands',
  'Kettlebell',
  'Smith Machine',
  'Bodyweight',
  'Cardio Machine',
  'Other',
] as const;

// ─── Category map ─────────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  strength:   'Strength',
  cardio:     'Cardio',
  bodyweight: 'Bodyweight',
  olympic:    'Olympic',
  stretching: 'Stretching',
};

// ─── Helper ───────────────────────────────────────────────────────────────
const e = (
  id: string,
  name: string,
  muscleGroup: string,
  muscle_groups: string[],
  category: string,
  equipment_required: string[],
  is_compound: boolean,
  instructions: string,
  videoUrl = '',
): Exercise => ({
  id,
  exercise_id: `ex_${id}`,
  name,
  muscleGroup,
  muscle_groups,
  category,
  equipment_required,
  is_compound,
  instructions,
  videoUrl,
});

// ─── Database ─────────────────────────────────────────────────────────────
export const EXERCISES: Exercise[] = [

  // ══════════════ CHEST ══════════════════════════════════════════════════
  e('1',  'Barbell Bench Press',         'Chest',     ['chest','triceps','shoulders'],  'strength',   ['barbell','bench'],         true,  'Lie flat on bench. Grip bar slightly wider than shoulder-width. Lower bar to mid-chest. Press back up explosively.'),
  e('2',  'Incline Barbell Bench Press', 'Chest',     ['chest','shoulders','triceps'],  'strength',   ['barbell','incline bench'],  true,  'Set bench to 30-45°. Grip bar. Lower bar to upper chest. Press up.'),
  e('3',  'Decline Barbell Bench Press', 'Chest',     ['chest','triceps'],             'strength',   ['barbell','decline bench'], true,  'Set bench to -15°. Lower bar to lower chest. Press up.'),
  e('4',  'Dumbbell Bench Press',        'Chest',     ['chest','triceps','shoulders'], 'strength',   ['dumbbells','bench'],        true,  'Lie on bench with a dumbbell in each hand. Lower until elbows at 90°. Press back up.'),
  e('5',  'Incline Dumbbell Press',      'Chest',     ['chest','shoulders','triceps'], 'strength',   ['dumbbells','incline bench'], true, 'Set bench to 30-45°. Lower dumbbells to upper chest. Press up.'),
  e('6',  'Dumbbell Fly',                'Chest',     ['chest'],                        'strength',   ['dumbbells','bench'],        false, 'Lie on bench. Arms extended above chest. Lower in a wide arc until you feel a stretch. Return.'),
  e('7',  'Incline Dumbbell Fly',        'Chest',     ['chest','shoulders'],            'strength',   ['dumbbells','incline bench'], false, 'Incline bench. Perform fly motion targeting upper chest.'),
  e('8',  'Cable Fly',                   'Chest',     ['chest'],                        'strength',   ['cable machine'],            false, 'Cables at shoulder height. Step forward, arms wide. Bring handles together in an arc.'),
  e('9',  'Low-to-High Cable Fly',       'Chest',     ['chest','shoulders'],            'strength',   ['cable machine'],            false, 'Cables set low. Sweep arms up and together, targeting upper chest fibers.'),
  e('10', 'High-to-Low Cable Fly',       'Chest',     ['chest'],                        'strength',   ['cable machine'],            false, 'Cables set high. Sweep arms down and together, targeting lower chest.'),
  e('11', 'Push-Up',                     'Chest',     ['chest','triceps','shoulders'],  'bodyweight', ['bodyweight'],               true,  'Hands shoulder-width. Lower chest to floor. Press up keeping core tight.'),
  e('12', 'Wide-Grip Push-Up',           'Chest',     ['chest'],                        'bodyweight', ['bodyweight'],               true,  'Hands wider than shoulders. Emphasises chest stretch.'),
  e('13', 'Decline Push-Up',             'Chest',     ['chest','shoulders'],            'bodyweight', ['bodyweight','bench'],        true,  'Feet elevated on bench. Hands on floor. Press up targeting upper chest.'),
  e('14', 'Diamond Push-Up',             'Chest',     ['triceps','chest'],              'bodyweight', ['bodyweight'],               true,  'Hands close together forming a diamond. Lower chest toward hands. Press up.'),
  e('15', 'Chest Dip',                   'Chest',     ['chest','triceps'],              'bodyweight', ['dip bars'],                 true,  'Lean forward at dip bars. Lower until chest dips below bars. Press back up.'),
  e('16', 'Pec Deck Machine',            'Chest',     ['chest'],                        'strength',   ['machine'],                  false, 'Sit at pec deck. Place forearms on pads. Bring arms together in a hugging motion.'),
  e('17', 'Smith Machine Bench Press',   'Chest',     ['chest','triceps'],              'strength',   ['smith machine','bench'],    true,  'Set up as with barbell bench but on Smith machine for stability.'),
  e('18', 'Svend Press',                 'Chest',     ['chest'],                        'strength',   ['plates'],                   false, 'Hold two plates together at chest height. Press forward squeezing chest.'),
  e('19', 'Chest Press Machine',         'Chest',     ['chest','shoulders','triceps'],  'strength',   ['machine'],                  true,  'Sit at chest press machine. Press handles forward then slowly return.'),
  e('20', 'Landmine Press',              'Chest',     ['chest','shoulders'],            'strength',   ['barbell','landmine'],       true,  'Hold one end of landmine barbell. Press up at an angle.'),

  // ══════════════ BACK ═══════════════════════════════════════════════════
  e('21', 'Deadlift',                    'Back',      ['back','hamstrings','glutes'],   'strength',   ['barbell'],                  true,  'Feet under bar, hip-width. Grab bar. Brace core. Stand by driving hips forward.'),
  e('22', 'Romanian Deadlift',           'Back',      ['hamstrings','glutes','back'],   'strength',   ['barbell'],                  true,  'Start standing. Hinge at hips, bar stays close to legs. Feel hamstring stretch. Drive hips forward.'),
  e('23', 'Sumo Deadlift',               'Back',      ['back','glutes','quads'],        'strength',   ['barbell'],                  true,  'Wide stance, toes out. Grip inside legs. Lift by pushing knees out.'),
  e('24', 'Barbell Row',                 'Back',      ['back','lats','biceps'],         'strength',   ['barbell'],                  true,  'Hinge forward. Back straight. Pull bar to lower chest. Squeeze blades.'),
  e('25', 'Pendlay Row',                 'Back',      ['back','lats'],                  'strength',   ['barbell'],                  true,  'Bar starts on floor each rep. Explosive pull to lower chest. Lower under control.'),
  e('26', 'T-Bar Row',                   'Back',      ['back','lats','biceps'],         'strength',   ['barbell','landmine'],       true,  'Straddle bar. Grip handle. Pull to chest.'),
  e('27', 'Seated Cable Row',            'Back',      ['back','lats','biceps'],         'strength',   ['cable machine'],            true,  'Sit at cable row. Use neutral grip. Pull handle to lower chest. Squeeze.'),
  e('28', 'Single-Arm Dumbbell Row',     'Back',      ['back','lats','biceps'],         'strength',   ['dumbbells','bench'],        false, 'One knee and hand on bench. Row dumbbell to hip. Elbow close to body.'),
  e('29', 'Lat Pulldown',                'Back',      ['lats','biceps'],                'strength',   ['cable machine'],            false, 'Grip bar wide. Pull to upper chest. Elbows out and down. Slow return.'),
  e('30', 'Close-Grip Lat Pulldown',     'Back',      ['lats','biceps'],                'strength',   ['cable machine'],            false, 'Neutral or close grip. Pull to chin. Elbows travel down and in.'),
  e('31', 'Pull-Up',                     'Back',      ['lats','biceps','back'],         'bodyweight', ['pull-up bar'],              true,  'Hang from bar. Pull until chin over bar. Lower with control.'),
  e('32', 'Chin-Up',                     'Back',      ['lats','biceps'],                'bodyweight', ['pull-up bar'],              true,  'Supinated (underhand) grip shoulder-width. Pull until chin over bar.'),
  e('33', 'Neutral Grip Pull-Up',        'Back',      ['lats','biceps'],                'bodyweight', ['pull-up bar'],              true,  'Parallel handles. Neutral grip. Pull until chin clears bar.'),
  e('34', 'Australian Pull-Up',          'Back',      ['back','biceps'],                'bodyweight', ['bar'],                      true,  'Hang below bar, heels on floor at angle. Pull chest to bar.'),
  e('35', 'Straight-Arm Pulldown',       'Back',      ['lats'],                         'strength',   ['cable machine'],            false, 'Face cable machine. Arms straight. Sweep bar from overhead to thighs.'),
  e('36', 'Face Pull',                   'Back',      ['rear delts','back'],            'strength',   ['cable machine'],            false, 'Cable at face height. Rope attachment. Pull toward face, elbows high.'),
  e('37', 'Rack Pull',                   'Back',      ['back','hamstrings'],            'strength',   ['barbell','rack'],            true,  'Bar set at knee height. Deadlift pattern. Good for upper back development.'),
  e('38', 'Good Morning',                'Back',      ['hamstrings','back'],            'strength',   ['barbell'],                  true,  'Bar on back, slight knee bend. Hinge at hips until torso parallel. Return.'),
  e('39', 'Hyperextension',              'Back',      ['back','glutes'],                'bodyweight', ['hyperextension bench'],     false, 'Lock feet in pad. Lower torso. Raise until in line with legs.'),
  e('40', 'Inverted Row',                'Back',      ['back','biceps'],                'bodyweight', ['bar'],                      true,  'Lie under bar, hands shoulder-width, body straight. Pull chest to bar.'),
  e('41', 'Cable Pullover',              'Back',      ['lats'],                         'strength',   ['cable machine'],            false, 'Kneel at cable. Rope overhead. Pull rope toward knees in arc.'),
  e('42', 'Meadows Row',                 'Back',      ['back','lats'],                  'strength',   ['barbell','landmine'],       false, 'Stand perpendicular to landmine. Row bar to hip.'),

  // ══════════════ SHOULDERS ═══════════════════════════════════════════════
  e('43', 'Barbell Overhead Press',      'Shoulders', ['shoulders','triceps'],          'strength',   ['barbell'],                  true,  'Bar at shoulder height. Press overhead. Lock out arms. Lower to clavicle.'),
  e('44', 'Seated Dumbbell Press',       'Shoulders', ['shoulders','triceps'],          'strength',   ['dumbbells','bench'],        true,  'Sit upright. Dumbbells at ear height. Press overhead. Lower to ear level.'),
  e('45', 'Arnold Press',                'Shoulders', ['shoulders','triceps'],          'strength',   ['dumbbells'],                true,  'Start palms facing you, curl to press while rotating palms forward.'),
  e('46', 'Lateral Raise',               'Shoulders', ['lateral delts'],                'strength',   ['dumbbells'],                false, 'Arms at sides. Raise to shoulder height, pinky high. Slow lower.'),
  e('47', 'Cable Lateral Raise',         'Shoulders', ['lateral delts'],                'strength',   ['cable machine'],            false, 'Cable at hip. Cross-body pull. Raise arm to shoulder height.'),
  e('48', 'Front Raise',                 'Shoulders', ['front delts'],                  'strength',   ['dumbbells'],                false, 'Raise arms straight forward to shoulder height. Alternate or together.'),
  e('49', 'Rear Delt Fly',               'Shoulders', ['rear delts'],                   'strength',   ['dumbbells'],                false, 'Hinge forward. Arms hanging. Raise to sides in reverse fly motion.'),
  e('50', 'Face Pull',                   'Shoulders', ['rear delts','back'],            'strength',   ['cable machine'],            false, 'Rope at face height. Pull toward face. Elbows high and wide.'),
  e('51', 'Upright Row',                 'Shoulders', ['shoulders','traps'],            'strength',   ['barbell'],                  false, 'Grip bar narrow. Pull to chin. Elbows lead, above bar level.'),
  e('52', 'Barbell Shrug',               'Shoulders', ['traps'],                        'strength',   ['barbell'],                  false, 'Hold bar at thighs. Shrug shoulders straight up. Pause at top.'),
  e('53', 'Dumbbell Shrug',              'Shoulders', ['traps'],                        'strength',   ['dumbbells'],                false, 'Hold dumbbells at sides. Shrug straight up. Hold at peak.'),
  e('54', 'Machine Shoulder Press',      'Shoulders', ['shoulders','triceps'],          'strength',   ['machine'],                  true,  'Adjust seat. Grip handles at shoulder height. Press overhead.'),
  e('55', 'Pike Push-Up',                'Shoulders', ['shoulders','triceps'],          'bodyweight', ['bodyweight'],               true,  'Downward dog position. Lower head toward floor. Press back up.'),
  e('56', 'Handstand Push-Up',           'Shoulders', ['shoulders','triceps'],          'bodyweight', ['bodyweight'],               true,  'Kick into handstand against wall. Lower head toward floor. Press back up.'),
  e('57', 'Cable Front Raise',           'Shoulders', ['front delts'],                  'strength',   ['cable machine'],            false, 'Cable at floor. Raise handle forward to shoulder height.'),

  // ══════════════ BICEPS ═══════════════════════════════════════════════════
  e('58', 'Barbell Curl',                'Biceps',    ['biceps'],                       'strength',   ['barbell'],                  false, 'Grip bar shoulder-width. Curl to chin. Squeeze at top. Slow lower.'),
  e('59', 'EZ-Bar Curl',                 'Biceps',    ['biceps'],                       'strength',   ['ez-bar'],                   false, 'Neutral-ish grip on EZ bar. Curl to chin. Easy on wrists.'),
  e('60', 'Dumbbell Curl',               'Biceps',    ['biceps'],                       'strength',   ['dumbbells'],                false, 'Alternate or together. Curl from hip to shoulder. Supinate wrist.'),
  e('61', 'Hammer Curl',                 'Biceps',    ['biceps','brachialis'],          'strength',   ['dumbbells'],                false, 'Neutral grip (hammer). Curl to shoulder. Targets brachialis.'),
  e('62', 'Incline Dumbbell Curl',       'Biceps',    ['biceps'],                       'strength',   ['dumbbells','incline bench'], false, 'Sit on incline bench. Arms hang. Curl without letting elbows swing.'),
  e('63', 'Concentration Curl',          'Biceps',    ['biceps'],                       'strength',   ['dumbbells'],                false, 'Sit on bench. Elbow on inner thigh. Curl dumbbell to shoulder.'),
  e('64', 'Preacher Curl',               'Biceps',    ['biceps'],                       'strength',   ['ez-bar','preacher bench'],  false, 'Rest upper arms on preacher pad. Curl bar to shoulder.'),
  e('65', 'Cable Curl',                  'Biceps',    ['biceps'],                       'strength',   ['cable machine'],            false, 'Straight bar or EZ attachment. Curl toward chin. Constant tension.'),
  e('66', 'Reverse Curl',                'Biceps',    ['brachialis','forearms'],        'strength',   ['barbell'],                  false, 'Overhand (pronated) grip. Curl bar to chin. Focus on brachialis.'),
  e('67', 'Zottman Curl',                'Biceps',    ['biceps','brachialis'],          'strength',   ['dumbbells'],                false, 'Curl up supinated. Rotate to pronated at top. Lower overhand.'),
  e('68', 'Spider Curl',                 'Biceps',    ['biceps'],                       'strength',   ['dumbbells','bench'],        false, 'Chest on incline bench, arms hanging. Curl dumbbell to forehead.'),
  e('69', 'Machine Curl',                'Biceps',    ['biceps'],                       'strength',   ['machine'],                  false, 'Rest upper arms on pad. Curl handles to shoulder. Slow lower.'),

  // ══════════════ TRICEPS ══════════════════════════════════════════════════
  e('70', 'Close-Grip Bench Press',      'Triceps',   ['triceps','chest'],              'strength',   ['barbell','bench'],          true,  'Hands shoulder-width on bar. Lower bar to chest. Press up, elbows in.'),
  e('71', 'Skull Crusher',               'Triceps',   ['triceps'],                      'strength',   ['barbell','bench'],          false, 'Lie on bench. Bar above head. Bend elbows lowering bar toward forehead. Extend.'),
  e('72', 'Overhead Tricep Extension',   'Triceps',   ['triceps'],                      'strength',   ['dumbbells'],                false, 'Hold dumbbell overhead with both hands. Lower behind head. Extend.'),
  e('73', 'Tricep Pushdown',             'Triceps',   ['triceps'],                      'strength',   ['cable machine'],            false, 'Cable overhead. Push bar/rope down to thighs. Elbows fixed at sides.'),
  e('74', 'Rope Pushdown',               'Triceps',   ['triceps'],                      'strength',   ['cable machine'],            false, 'Rope attachment. Push down and slightly out at bottom. Squeeze.'),
  e('75', 'Overhead Cable Extension',    'Triceps',   ['triceps'],                      'strength',   ['cable machine'],            false, 'Rope at low cable. Face away. Extend arms overhead. Long head focus.'),
  e('76', 'Tricep Dip',                  'Triceps',   ['triceps','chest','shoulders'],  'bodyweight', ['dip bars'],                 true,  'Upright posture at dip bars. Lower until elbows at 90°. Press up.'),
  e('77', 'Bench Dip',                   'Triceps',   ['triceps'],                      'bodyweight', ['bench'],                    false, 'Hands on bench behind you. Dip down. Legs straight for more resistance.'),
  e('78', 'Diamond Push-Up',             'Triceps',   ['triceps','chest'],              'bodyweight', ['bodyweight'],               true,  'Diamond hand position. Elbows in tight. Lower chest to hands. Extend.'),
  e('79', 'Kickback',                    'Triceps',   ['triceps'],                      'strength',   ['dumbbells'],                false, 'Hinge forward. Upper arm parallel to floor. Extend forearm back.'),
  e('80', 'Machine Dip',                 'Triceps',   ['triceps'],                      'strength',   ['machine'],                  false, 'Seated. Push handles down. Elbows travel past hips.'),

  // ══════════════ FOREARMS ═════════════════════════════════════════════════
  e('81', 'Wrist Curl',                  'Forearms',  ['forearms'],                     'strength',   ['barbell'],                  false, 'Rest forearms on thighs. Curl wrist up.'),
  e('82', 'Reverse Wrist Curl',          'Forearms',  ['forearms'],                     'strength',   ['barbell'],                  false, 'Overhand grip. Rest forearms. Extend wrist up.'),
  e('83', 'Farmer Carry',                'Forearms',  ['forearms','traps','core'],      'strength',   ['dumbbells','kettlebell'],   true,  'Heavy dumbbells in hands. Walk distance. Keep torso upright.'),
  e('84', 'Plate Pinch',                 'Forearms',  ['forearms'],                     'strength',   ['plates'],                   false, 'Hold weight plate between fingers. Pinch for time.'),
  e('85', 'Dead Hang',                   'Forearms',  ['forearms','back'],              'bodyweight', ['pull-up bar'],              false, 'Hang from bar. Hold for time. Improves grip strength.'),

  // ══════════════ CORE / ABS ════════════════════════════════════════════════
  e('86', 'Plank',                       'Core',      ['core'],                         'bodyweight', ['bodyweight'],               false, 'Forearms on floor. Body straight. Hold position. Breathe.'),
  e('87', 'Side Plank',                  'Core',      ['core','obliques'],              'bodyweight', ['bodyweight'],               false, 'One forearm on floor. Body in a straight line. Hold.'),
  e('88', 'Crunch',                      'Core',      ['core'],                         'bodyweight', ['bodyweight'],               false, 'Lie on back. Curl upper body toward knees. Lower slowly.'),
  e('89', 'Bicycle Crunch',              'Core',      ['core','obliques'],              'bodyweight', ['bodyweight'],               false, 'Alternate elbow to opposite knee while pedaling legs.'),
  e('90', 'Leg Raise',                   'Core',      ['core','hip flexors'],           'bodyweight', ['bodyweight'],               false, 'Lie on back. Raise straight legs to 90°. Lower without touching floor.'),
  e('91', 'Hanging Leg Raise',           'Core',      ['core','hip flexors'],           'bodyweight', ['pull-up bar'],              false, 'Hang from bar. Raise straight legs to 90°. Lower slowly.'),
  e('92', 'Ab Wheel Rollout',            'Core',      ['core'],                         'strength',   ['ab wheel'],                 false, 'Kneel with ab wheel. Roll forward until fully extended. Roll back.'),
  e('93', 'Cable Crunch',                'Core',      ['core'],                         'strength',   ['cable machine'],            false, 'Kneel at cable. Rope to head. Crunch down, rounding back.'),
  e('94', 'Russian Twist',               'Core',      ['core','obliques'],              'bodyweight', ['bodyweight'],               false, 'Sit with legs elevated. Rotate torso side to side. Add weight for intensity.'),
  e('95', 'Wood Chop',                   'Core',      ['core','obliques'],              'strength',   ['cable machine'],            false, 'Cable at high position. Rotate and pull across body diagonally.'),
  e('96', 'Dragon Flag',                 'Core',      ['core'],                         'bodyweight', ['bench'],                    false, 'Grip bench behind head. Raise body to vertical. Lower as one unit, slowly.'),
  e('97', 'Hollow Body Hold',            'Core',      ['core'],                         'bodyweight', ['bodyweight'],               false, 'Lie back. Arms overhead. Raise shoulders and legs off floor. Hold.'),
  e('98', 'V-Up',                        'Core',      ['core','hip flexors'],           'bodyweight', ['bodyweight'],               false, 'Lie flat. Simultaneously raise arms and legs, touch feet. Lower.'),
  e('99', 'Flutter Kick',                'Core',      ['core','hip flexors'],           'bodyweight', ['bodyweight'],               false, 'Lie flat. Raise legs 6 inches. Flutter in small kicks.'),
  e('100','Pallof Press',                'Core',      ['core','obliques'],              'strength',   ['cable machine','bands'],    false, 'Side-on to cable. Press handle out and hold. Resist rotation.'),

  // ══════════════ LEGS – QUADS ══════════════════════════════════════════════
  e('101','Barbell Squat',               'Legs',      ['quads','glutes','hamstrings'],  'strength',   ['barbell'],                  true,  'Bar on traps. Feet shoulder-width. Squat until thighs parallel. Stand.'),
  e('102','Front Squat',                 'Legs',      ['quads','core'],                 'strength',   ['barbell'],                  true,  'Bar on front delts. Elbows high. Squat deep. Upright torso.'),
  e('103','Bulgarian Split Squat',       'Legs',      ['quads','glutes'],               'strength',   ['dumbbells','bench'],        true,  'Rear foot elevated. Front foot forward. Lower until knee near floor. Press through heel.'),
  e('104','Goblet Squat',                'Legs',      ['quads','glutes','core'],        'strength',   ['kettlebell','dumbbells'],   true,  'Hold weight at chest. Squat deep. Elbows inside knees. Stand tall.'),
  e('105','Leg Press',                   'Legs',      ['quads','glutes','hamstrings'],  'strength',   ['machine'],                  true,  'Feet shoulder-width on platform. Lower sled. Do not let knees cave. Press up.'),
  e('106','Hack Squat',                  'Legs',      ['quads','glutes'],               'strength',   ['machine'],                  true,  'Shoulders under pads. Feet on platform. Squat down. Press through whole foot.'),
  e('107','Walking Lunge',               'Legs',      ['quads','glutes'],               'strength',   ['dumbbells'],                true,  'Alternate legs, stepping forward into lunge position. Keep torso upright.'),
  e('108','Reverse Lunge',               'Legs',      ['quads','glutes'],               'strength',   ['dumbbells'],                true,  'Step backward into lunge. Front knee tracks over toes.'),
  e('109','Step-Up',                     'Legs',      ['quads','glutes'],               'strength',   ['dumbbells','bench'],        true,  'Step on box or bench and drive through heel to stand. Step down.'),
  e('110','Leg Extension',               'Legs',      ['quads'],                        'strength',   ['machine'],                  false, 'Sit at machine. Hook ankles behind pad. Extend legs. Slow lower.'),
  e('111','Sissy Squat',                 'Legs',      ['quads'],                        'bodyweight', ['bodyweight'],               false, 'Hold support. Lean back and lower knees toward floor keeping hips forward.'),
  e('112','Sumo Squat',                  'Legs',      ['quads','glutes','adductors'],   'strength',   ['dumbbells','kettlebell'],   true,  'Wide stance, toes out. Hold weight between legs. Squat down.'),
  e('113','Wall Sit',                    'Legs',      ['quads'],                        'bodyweight', ['bodyweight'],               false, 'Back against wall. Thighs parallel to floor. Hold position.'),

  // ══════════════ GLUTES ════════════════════════════════════════════════════
  e('114','Hip Thrust',                  'Glutes',    ['glutes','hamstrings'],          'strength',   ['barbell','bench'],          false, 'Upper back on bench. Bar over hips. Drive hips up. Squeeze glutes at top.'),
  e('115','Glute Bridge',                'Glutes',    ['glutes','hamstrings'],          'bodyweight', ['bodyweight'],               false, 'Lie on back. Feet flat. Drive hips up. Squeeze glutes. Hold 2s.'),
  e('116','Cable Kickback',              'Glutes',    ['glutes'],                       'strength',   ['cable machine'],            false, 'Anchor at ankle. Face cable machine. Kick leg back. Do not swing torso.'),
  e('117','Donkey Kick',                 'Glutes',    ['glutes'],                       'bodyweight', ['bodyweight'],               false, 'On all fours. Kick one leg straight back and up. Squeeze at top.'),
  e('118','Clamshell',                   'Glutes',    ['glutes','hip abductors'],       'bodyweight', ['bodyweight','bands'],       false, 'Side lying. Knees bent. Open top knee like clamshell. Keep heels together.'),
  e('119','Lateral Band Walk',           'Glutes',    ['glutes','hip abductors'],       'bodyweight', ['bands'],                    false, 'Band around ankles. Semi-squat position. Step side to side.'),
  e('120','Single-Leg Hip Thrust',       'Glutes',    ['glutes'],                       'strength',   ['bench'],                    false, 'Hip thrust with one leg extended or crossed. Isolates each glute.'),
  e('121','Romanian Deadlift',           'Glutes',    ['glutes','hamstrings','back'],   'strength',   ['barbell','dumbbells'],      true,  'Hip hinge. Back neutral. Bar stays close to legs. Feel stretch in hamstrings.'),

  // ══════════════ HAMSTRINGS ════════════════════════════════════════════════
  e('122','Leg Curl (Lying)',            'Hamstrings',['hamstrings'],                   'strength',   ['machine'],                  false, 'Lie face down. Curl ankles toward glutes. Slow eccentric.'),
  e('123','Leg Curl (Seated)',           'Hamstrings',['hamstrings'],                   'strength',   ['machine'],                  false, 'Seated machine. Curl lower pad down. Full range slow.'),
  e('124','Nordic Hamstring Curl',       'Hamstrings',['hamstrings'],                   'bodyweight', ['bodyweight'],               false, 'Kneel, anchor feet. Lower body slowly to floor using hamstrings. Use hands to push back up.'),
  e('125','Dumbbell RDL',                'Hamstrings',['hamstrings','glutes'],          'strength',   ['dumbbells'],                true,  'Hold dumbbells. Hinge at hips. Lower until you feel a deep hamstring stretch.'),
  e('126','Good Morning',                'Hamstrings',['hamstrings','back'],            'strength',   ['barbell'],                  true,  'Bar on traps. Hinge at hips. Lower torso. Rise back to upright.'),
  e('127','Glute-Ham Raise',             'Hamstrings',['hamstrings','glutes'],          'bodyweight', ['GHD machine'],              true,  'Lock feet in GHD. Lower torso. Raise back up using hamstrings.'),

  // ══════════════ CALVES ════════════════════════════════════════════════════
  e('128','Standing Calf Raise',         'Calves',    ['calves'],                       'strength',   ['machine','bodyweight'],     false, 'Toes on edge. Lower heel below platform. Rise onto tiptoes. Pause.'),
  e('129','Seated Calf Raise',           'Calves',    ['soleus','calves'],              'strength',   ['machine'],                  false, 'Seated machine. Pad on quads. Rise and lower through full range.'),
  e('130','Donkey Calf Raise',           'Calves',    ['calves'],                       'strength',   ['machine','bodyweight'],     false, 'Hip bent at 90°. Rise onto toes. Stretches calves further.'),
  e('131','Single-Leg Calf Raise',       'Calves',    ['calves'],                       'bodyweight', ['bodyweight'],               false, 'Hold support. One foot. Rise and lower through full range.'),

  // ══════════════ CARDIO ════════════════════════════════════════════════════
  e('132','Running (Treadmill)',         'Cardio',    ['cardio'],                       'cardio',     ['cardio machine'],           false, 'Set speed. Maintain cadence. Arms swing naturally.'),
  e('133','Cycling (Stationary)',        'Cardio',    ['cardio','legs'],                'cardio',     ['cardio machine'],           false, 'Adjust seat height. Maintain cadence. Vary resistance for intervals.'),
  e('134','Rowing Machine',              'Cardio',    ['cardio','back','core'],         'cardio',     ['cardio machine'],           true,  'Push with legs first. Then lean back. Then pull with arms. Reverse on recovery.'),
  e('135','Elliptical',                  'Cardio',    ['cardio'],                       'cardio',     ['cardio machine'],           false, 'Low impact. Maintain upright posture. Vary resistance and incline.'),
  e('136','Stair Climber',               'Cardio',    ['cardio','legs','glutes'],       'cardio',     ['cardio machine'],           false, 'Step at steady pace. Do not lean heavily on rails.'),
  e('137','Jump Rope',                   'Cardio',    ['cardio','calves'],              'cardio',     ['jump rope'],                false, 'Light on feet. Wrists rotate the rope. Land softly.'),
  e('138','Box Jump',                    'Cardio',    ['cardio','legs','glutes'],       'strength',   ['box'],                      true,  'Jump onto box from standing. Land softly with knees bent. Step down.'),
  e('139','Burpee',                      'Cardio',    ['cardio','chest','core','legs'], 'bodyweight', ['bodyweight'],               true,  'Squat to floor. Kick feet back to plank. Push-up. Jump feet forward. Explode up.'),
  e('140','Mountain Climber',            'Cardio',    ['cardio','core'],                'bodyweight', ['bodyweight'],               false, 'Start in plank. Alternate knees toward chest rapidly.'),
  e('141','HIIT Sprint',                 'Cardio',    ['cardio','legs'],                'cardio',     ['cardio machine','bodyweight'], false, 'All-out sprint for 20-30s. Rest 40-60s. Repeat 8-10 rounds.'),
  e('142','Swimming',                    'Cardio',    ['cardio','full body'],           'cardio',     ['other'],                    true,  'Full stroke technique. Breathe every 2-3 strokes. Kick from hips.'),
  e('143','Cycling (Outdoor)',           'Cardio',    ['cardio','legs'],                'cardio',     ['other'],                    false, 'Maintain steady cadence. Shift gears to manage effort.'),
  e('144','Assault Bike',                'Cardio',    ['cardio','full body'],           'cardio',     ['cardio machine'],           true,  'Full effort. Arms and legs work simultaneously. Great for HIIT.'),
  e('145','Ski Erg',                     'Cardio',    ['cardio','back','core'],         'cardio',     ['cardio machine'],           true,  'Drive handles down with straight arms, hinge at hips simultaneously.'),

  // ══════════════ FULL BODY / OLYMPIC ══════════════════════════════════════
  e('146','Power Clean',                 'Olympic',   ['full body','back','legs'],      'olympic',    ['barbell'],                  true,  'Pull bar from floor. Triple extension of ankles, knees, hips. Catch in front rack.'),
  e('147','Hang Clean',                  'Olympic',   ['full body','legs'],             'olympic',    ['barbell'],                  true,  'Start at hip. Explosive shrug and pull under bar. Front rack catch.'),
  e('148','Snatch',                      'Olympic',   ['full body'],                    'olympic',    ['barbell'],                  true,  'Wide grip. Pull from floor. Overhead catch with lockout. Requires mobility.'),
  e('149','Push Press',                  'Olympic',   ['shoulders','legs'],             'strength',   ['barbell'],                  true,  'Slight leg dip. Explode bar overhead. Lock out arms.'),
  e('150','Hang Power Clean',            'Olympic',   ['full body'],                    'olympic',    ['barbell'],                  true,  'Hang at hip. Jump and shrug. Receive bar in high front rack.'),
  e('151','Clean & Jerk',                'Olympic',   ['full body'],                    'olympic',    ['barbell'],                  true,  'Clean the bar to front rack. Dip and drive to overhead. Jerk split.'),
  e('152','Thruster',                    'Full Body', ['legs','shoulders','core'],      'strength',   ['barbell','dumbbells'],      true,  'Front squat to press in one fluid motion.'),
  e('153','Kettlebell Swing',            'Full Body', ['glutes','hamstrings','back'],   'strength',   ['kettlebell'],               true,  'Hip hinge. Drive hips forward to swing bell to chest height. Let it swing back.'),
  e('154','Kettlebell Turkish Get-Up',   'Full Body', ['full body','core'],             'strength',   ['kettlebell'],               true,  'Arm vertical. Roll to elbow, hand, tall-kneeling, stand. Reverse.'),
  e('155','Kettlebell Clean & Press',    'Full Body', ['shoulders','legs','core'],      'strength',   ['kettlebell'],               true,  'Clean bell to rack. Press overhead. Lower with control.'),
  e('156','Sandbag Carry',               'Full Body', ['full body','core'],             'strength',   ['other'],                    true,  'Bear hug or shoulder carry. Walk distance maintaining upright posture.'),
  e('157','Bear Crawl',                  'Full Body', ['core','shoulders','legs'],      'bodyweight', ['bodyweight'],               true,  'On hands and feet. Knees low to ground. Crawl forward alternating limbs.'),
  e('158','Battle Rope',                 'Full Body', ['cardio','shoulders','core'],    'cardio',     ['battle ropes'],             true,  'Alternate or simultaneous arm waves. Drive from core. Maintain athletic stance.'),
  e('159','Sled Push',                   'Full Body', ['legs','glutes','core'],         'strength',   ['sled'],                     true,  'Low angle through sled handles. Drive with legs. Keep back flat.'),
  e('160','Tire Flip',                   'Full Body', ['legs','back','core'],           'strength',   ['tire'],                     true,  'Deadlift, then push, then flip tire. Reset position each rep.'),

  // ══════════════ STRETCHING / MOBILITY ════════════════════════════════════
  e('161','Hip Flexor Stretch',          'Stretching',['hip flexors'],                  'stretching', ['bodyweight'],               false, 'Kneeling lunge. Tuck pelvis. Lean forward until stretch felt. Hold 30-60s.'),
  e('162','Hamstring Stretch',           'Stretching',['hamstrings'],                   'stretching', ['bodyweight'],               false, 'Sit or stand. Straighten knee. Reach toward toes. Hold 30s.'),
  e('163','Quad Stretch',                'Stretching',['quads'],                        'stretching', ['bodyweight'],               false, 'Stand on one leg. Pull ankle toward glute. Hold.'),
  e('164','Calf Stretch',                'Stretching',['calves'],                       'stretching', ['bodyweight'],               false, 'Foot on wall or step edge. Lean forward. Feel calf stretch.'),
  e('165','Pigeon Pose',                 'Stretching',['glutes','hip flexors'],         'stretching', ['bodyweight'],               false, 'Lead leg bent at 90°. Back leg straight. Lower hips toward floor.'),
  e('166','Cat-Cow',                     'Stretching',['back','core'],                  'stretching', ['bodyweight'],               false, 'On all fours. Alternate arching and rounding spine slowly.'),
  e('167','World-Greatest Stretch',      'Stretching',['full body'],                    'stretching', ['bodyweight'],               true,  'Lunge, rotate arm to sky, drop elbow to floor. Thoracic and hip focus.'),
  e('168','90/90 Hip Stretch',           'Stretching',['glutes','hip rotators'],        'stretching', ['bodyweight'],               false, 'Both legs bent at 90°. Lean over front leg. Targets external rotation.'),
  e('169','Thoracic Extension',          'Stretching',['back','shoulders'],             'stretching', ['foam roller'],              false, 'Foam roller under upper back. Support head. Extend over roller.'),
  e('170','Shoulder Cross-Body Stretch', 'Stretching',['shoulders'],                    'stretching', ['bodyweight'],               false, 'Pull arm across chest. Use other hand at elbow. Hold 30s.'),

  // ══════════════ ADDITIONAL STRENGTH VARIETY ═══════════════════════════════
  e('171','Trap Bar Deadlift',           'Back',      ['back','legs','glutes'],         'strength',   ['trap bar'],                 true,  'Stand inside trap bar. Neutral spine. Push through floor to stand.'),
  e('172','Paused Bench Press',          'Chest',     ['chest','triceps'],              'strength',   ['barbell','bench'],          true,  'Regular bench press but pause 1-2s at chest before pressing.'),
  e('173','Spoto Press',                 'Chest',     ['chest','triceps'],              'strength',   ['barbell','bench'],          true,  'Stop bar 1 inch above chest. Hold. Press. Builds strength off chest.'),
  e('174','Incline Cable Fly',           'Chest',     ['chest'],                        'strength',   ['cable machine'],            false, 'Incline bench between cables set low. Fly motion upward.'),
  e('175','Seal Row',                    'Back',      ['back','lats'],                  'strength',   ['barbell','bench'],          false, 'Lie prone on raised bench. Row bar from hanging position. Isolates lats.'),
  e('176','Chest-Supported Row',         'Back',      ['back','lats'],                  'strength',   ['dumbbells','incline bench'], false, 'Prone on incline bench. Row dumbbells. No lower back involvement.'),
  e('177','Dumbbell Pullover',           'Back',      ['lats','chest'],                 'strength',   ['dumbbells','bench'],        false, 'Lie across bench. Dumbbell above chest. Arc back overhead then return.'),
  e('178','Cable Row (Wide Grip)',       'Back',      ['back','lats'],                  'strength',   ['cable machine'],            false, 'Wide overhand grip on cable row. Targets upper back and rear delts.'),
  e('179','Jefferson Curl',              'Back',      ['back','hamstrings'],            'strength',   ['barbell','dumbbells'],      false, 'Slow spinal flexion while holding weight. Mobility and decompression.'),
  e('180','Incline Hammer Curl',         'Biceps',    ['biceps','brachialis'],          'strength',   ['dumbbells','incline bench'], false, 'Arms fully extended behind torso. Curl with neutral grip for deep stretch.'),
  e('181','Cable Hammer Curl',           'Biceps',    ['biceps','brachialis'],          'strength',   ['cable machine'],            false, 'Rope attachment. Neutral grip. Curl toward shoulder. Split at top.'),
  e('182','Bayesian Curl',               'Biceps',    ['biceps'],                       'strength',   ['cable machine'],            false, 'Cable behind body. Curl forward. Standing. Full stretch on bicep.'),
  e('183','Tate Press',                  'Triceps',   ['triceps'],                      'strength',   ['dumbbells','bench'],        false, 'Lie on bench. Dumbbells above chest. Bend elbows so dumbbells tap chest.'),
  e('184','JM Press',                    'Triceps',   ['triceps'],                      'strength',   ['barbell','bench'],          false, 'Hybrid between close-grip bench and skull crusher. Bar to throat.'),
  e('185','Incline Skull Crusher',       'Triceps',   ['triceps'],                      'strength',   ['barbell','incline bench'],  false, 'On incline bench. Lower bar behind head. Extends long head range.'),
  e('186','Cable Kickback',              'Triceps',   ['triceps'],                      'strength',   ['cable machine'],            false, 'Hinge forward. Cable pull from low. Extend arm back.'),
  e('187','Front Squat (Pause)',         'Legs',      ['quads','core'],                 'strength',   ['barbell'],                  true,  'Front squat with 2-3s pause at bottom. Builds quad strength.'),
  e('188','Box Squat',                   'Legs',      ['quads','glutes','hamstrings'],  'strength',   ['barbell','box'],            true,  'Sit to box at parallel. Pause. Drive up explosively.'),
  e('189','Safety Bar Squat',            'Legs',      ['quads','glutes'],               'strength',   ['safety bar'],               true,  'Camber bar on traps. Upright posture. Full depth squat.'),
  e('190','Heel-Elevated Squat',         'Legs',      ['quads'],                        'strength',   ['dumbbells','plates'],       true,  'Heels on plates or wedge. Torso more upright. Deep quad engagement.'),
  e('191','Split Squat',                 'Legs',      ['quads','glutes'],               'strength',   ['dumbbells'],                true,  'Stationary lunge position. Lower back knee. Drive through front foot.'),
  e('192','Reverse Hyper',               'Glutes',    ['glutes','hamstrings','back'],   'strength',   ['reverse hyper machine'],    false, 'Prone on pad. Swing legs up. Decompress spine.'),
  e('193','Single-Leg RDL',              'Hamstrings',['hamstrings','glutes','balance'], 'strength',  ['dumbbells'],                false, 'One leg RDL. Counterweight the lifted leg. Control the descent.'),
  e('194','Leg Press (Single Leg)',      'Legs',      ['quads','glutes'],               'strength',   ['machine'],                  false, 'One leg at a time on leg press. Ensures balanced development.'),
  e('195','Pendulum Squat',              'Legs',      ['quads'],                        'strength',   ['machine'],                  true,  'Pendulum machine. Very upright torso. Deep quad emphasis.'),
  e('196','Cable Pull-Through',          'Glutes',    ['glutes','hamstrings'],          'strength',   ['cable machine'],            false, 'Face away from cable. Rope between legs. Hip hinge to pull.'),
  e('197','Nordic Raise',                'Legs',      ['hamstrings','glutes'],          'bodyweight', ['bodyweight'],               false, 'Anchor feet. Lower body forward slowly using hamstrings.'),
  e('198','Pike Push-Up to Downdog',     'Shoulders', ['shoulders','core'],             'bodyweight', ['bodyweight'],               true,  'From plank, push hips up to downdog then lower to pike push-up.'),
  e('199','Pseudo Planche Push-Up',      'Chest',     ['chest','shoulders','core'],     'bodyweight', ['bodyweight'],               true,  'Hands turned back. Weight shifted forward. Lower chest to floor.'),
  e('200','Ring Row',                    'Back',      ['back','biceps','core'],         'bodyweight', ['rings'],                    true,  'Feet on floor. Body under rings. Pull chest to rings. Lean back for harder.'),
  e('201','Ring Dip',                    'Triceps',   ['triceps','chest','shoulders'],  'bodyweight', ['rings'],                    true,  'Support on rings. Lower until elbows at 90°. Press back up. Stabilise rings.'),
  e('202','Ring Pull-Up',                'Back',      ['lats','biceps'],                'bodyweight', ['rings'],                    true,  'Pull-up on gymnastic rings. Rotate rings inward at top.'),
  e('203','Muscle-Up',                   'Full Body', ['lats','chest','triceps'],       'bodyweight', ['pull-up bar','rings'],      true,  'Explosive pull-up then transition over bar into dip. High pulling skill.'),
  e('204','L-Sit',                       'Core',      ['core','hip flexors','triceps'], 'bodyweight', ['bars','rings'],             false, 'Support on bars. Lift straight legs to parallel. Hold.'),
  e('205','Human Flag',                  'Full Body', ['core','back','shoulders'],      'bodyweight', ['vertical pole'],            false, 'Grip vertical pole. Body horizontal. Extreme lateral core and shoulder strength.'),

  // More exercises to fill out the database
  e('206','Incline Dumbbell Row',        'Back',      ['back','lats'],                  'strength',   ['dumbbells','incline bench'], false, 'Chest on incline bench. Row dumbbells simultaneously. No body swing.'),
  e('207','Banded Pull-Apart',           'Shoulders', ['rear delts','back'],            'strength',   ['bands'],                    false, 'Hold band. Pull apart across chest. Squeeze rear delts.'),
  e('208','Cuban Press',                 'Shoulders', ['rear delts','rotator cuff'],    'strength',   ['dumbbells'],                false, 'Upright row, then external rotation, then press. Rotator cuff health.'),
  e('209','W-Raise',                     'Shoulders', ['rear delts'],                   'strength',   ['dumbbells'],                false, 'Prone on incline bench. Lift dumbbells creating W shape with arms.'),
  e('210','Reverse Pec Deck',            'Shoulders', ['rear delts'],                   'strength',   ['machine'],                  false, 'Face the pec deck reversed. Open arms out. Squeeze rear delts.'),
  e('211','Dumbbell Bench Pull',         'Back',      ['back','lats'],                  'strength',   ['dumbbells','bench'],        false, 'Lie face down on bench. Alternate single arm rows.'),
  e('212','Half-Kneeling Cable Pull',    'Back',      ['lats','core'],                  'strength',   ['cable machine'],            false, 'Half-kneeling. Pull cable from opposite high angle. Anti-rotation core.'),
  e('213','Single-Leg Glute Bridge',     'Glutes',    ['glutes','hamstrings'],          'bodyweight', ['bodyweight'],               false, 'One leg extended. Hip thrust. Hold at top. Squeeze.'),
  e('214','Frog Pump',                   'Glutes',    ['glutes'],                       'bodyweight', ['bodyweight'],               false, 'Lie on back. Soles of feet together. Pump hips up rapidly.'),
  e('215','Hip Abduction Machine',       'Glutes',    ['glutes','hip abductors'],       'strength',   ['machine'],                  false, 'Seat machine. Drive knees outward against padding.'),
  e('216','Hip Adduction Machine',       'Legs',      ['adductors'],                    'strength',   ['machine'],                  false, 'Seat machine. Drive knees inward. Targets inner thigh.'),
  e('217','Inner Thigh Squeeze',         'Legs',      ['adductors'],                    'bodyweight', ['bodyweight'],               false, 'Ball or foam roller between knees. Leg raises or isometric squeezes.'),
  e('218','Tibialis Raise',              'Calves',    ['tibialis anterior'],            'bodyweight', ['bodyweight'],               false, 'Heels on edge. Raise toes toward shin. Prevents shin splints.'),
  e('219','Soleus Raise',                'Calves',    ['soleus'],                       'strength',   ['machine'],                  false, 'Seated calf raise with bent knee. Isolates soleus.'),
  e('220','Wrist Roller',                'Forearms',  ['forearms'],                     'strength',   ['other'],                    false, 'Roll weight up and down on rope attached to bar. Grip endurance.'),
  e('221','Towel Pull-Up',               'Back',      ['back','forearms'],              'bodyweight', ['pull-up bar','towel'],      true,  'Drape towel over bar. Grip ends. Perform pull-up. Grip strength.'),
  e('222','One-Arm Push-Up',             'Chest',     ['chest','triceps','core'],       'bodyweight', ['bodyweight'],               true,  'Wide stance. One hand behind back. Lower slowly. Press up.'),
  e('223','Pike Press',                  'Shoulders', ['shoulders','triceps'],          'bodyweight', ['bodyweight'],               true,  'Hips high in pike. Lower head to floor. Press back up.'),
  e('224','Archer Push-Up',              'Chest',     ['chest','triceps'],              'bodyweight', ['bodyweight'],               true,  'Wide hands. Shift weight side to side lowering on one arm at a time.'),
  e('225','Typewriter Pull-Up',          'Back',      ['lats','biceps'],                'bodyweight', ['pull-up bar'],              true,  'Pull up. Slide to one side. Slide across bar to other side. Lower.'),
  e('226','Cable Woodchop Low-to-High',  'Core',      ['core','obliques'],              'strength',   ['cable machine'],            false, 'Cable at low position. Rotate diagonally across body and upward.'),
  e('227','Pallof Press (Kneeling)',     'Core',      ['core','obliques'],              'strength',   ['cable machine'],            false, 'Half kneeling. Press and resist rotation. Maintain spine neutral.'),
  e('228','Suitcase Carry',              'Core',      ['core','obliques','traps'],      'strength',   ['dumbbells','kettlebell'],   false, 'Heavy load in one hand only. Walk. Resist lateral bend. Core anti-lateral flex.'),
  e('229','Copenhagen Plank',            'Core',      ['core','adductors','obliques'],  'bodyweight', ['bench'],                    false, 'Side plank. Top leg on bench, bottom leg under. Hold. Advanced side core.'),
  e('230','Stir the Pot',                'Core',      ['core'],                         'bodyweight', ['stability ball'],           false, 'Plank on ball with forearms. Circle ball in both directions.'),
  e('231','Jump Squat',                  'Legs',      ['quads','glutes','calves'],      'bodyweight', ['bodyweight'],               true,  'Squat down. Explode upward. Land softly. Immediate next rep.'),
  e('232','Broad Jump',                  'Legs',      ['quads','glutes'],               'bodyweight', ['bodyweight'],               true,  'Squat, swing arms, jump forward as far as possible. Land balanced.'),
  e('233','Single-Leg Box Jump',         'Legs',      ['quads','glutes'],               'bodyweight', ['box'],                      true,  'Jump off one leg onto box. Land on both. Builds explosive leg power.'),
  e('234','Speed Skater',                'Cardio',    ['cardio','glutes','legs'],       'bodyweight', ['bodyweight'],               true,  'Lateral bound side to side. Extend opposite arm. Plyometric movement.'),
  e('235','Tuck Jump',                   'Cardio',    ['cardio','legs','core'],         'bodyweight', ['bodyweight'],               true,  'Jump up, tuck knees to chest. Land soft. Repeat.'),
  e('236','Jumping Jack',                'Cardio',    ['cardio'],                       'cardio',     ['bodyweight'],               false, 'Jump feet wide while raising arms. Jump back together. Warm-up classic.'),
  e('237','High Knees',                  'Cardio',    ['cardio','core','hip flexors'],  'cardio',     ['bodyweight'],               false, 'Run in place bringing knees to hip height rapidly.'),
  e('238','Butt Kick',                   'Cardio',    ['cardio','hamstrings'],          'cardio',     ['bodyweight'],               false, 'Run in place kicking heels toward glutes.'),
  e('239','Rowing (Outdoor)',            'Cardio',    ['cardio','back','core'],         'cardio',     ['other'],                    true,  'Boat rowing. Drive legs first, lean back, finish with arms.'),
  e('240','Handstand Walk',              'Full Body', ['shoulders','core','balance'],   'bodyweight', ['bodyweight'],               true,  'Kick to handstand. Walk forward on hands. Balance with eyes.'),
];

// ─── Look-up helpers ──────────────────────────────────────────────────────

/** O(1) exercise lookup by id */
export const EXERCISE_MAP: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((ex) => [ex.id, ex]),
);

/** All unique muscle groups appearing in the data */
export const UNIQUE_MUSCLE_GROUPS: string[] = [
  ...new Set(EXERCISES.map((ex) => ex.muscleGroup)),
].sort();

/** All unique equipment types appearing in the data */
export const UNIQUE_EQUIPMENT: string[] = [
  ...new Set(EXERCISES.flatMap((ex) => ex.equipment_required)),
].sort();

export default EXERCISES;
