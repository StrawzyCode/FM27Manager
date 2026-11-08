/*
 * roles-data.js
 * -------------
 * All the football knowledge lives in this file: which slots exist,
 * which roles/duties are available in each slot, which attributes
 * matter for each role, and the grid-based formation presets.
 *
 * A note on scope: this uses the well-established Position / Role / Duty
 * framework that's been consistent across recent FM versions. If your
 * copy of the game has renamed or restructured something, this is the
 * file to edit - everything below is plain data.
 *
 * Nothing in here touches the DOM or does any parsing.
 */

// ---------------------------------------------------------------------
// Pitch slots (one per selectable position). `group` + `side` is also
// how we check a player's natural position against a slot
// (see engine.js -> familiarity()).
// ---------------------------------------------------------------------
const POSITION_SLOTS = [
  { code: 'GK',   label: 'Goalkeeper',        group: 'GK', side: null },
  { code: 'D_L',  label: 'Full Back (L)',     group: 'D',  side: 'L' },
  { code: 'D_C',  label: 'Centre Back',       group: 'D',  side: 'C' },
  { code: 'D_R',  label: 'Full Back (R)',     group: 'D',  side: 'R' },
  { code: 'WB_L', label: 'Wing Back (L)',     group: 'WB', side: 'L' },
  { code: 'WB_R', label: 'Wing Back (R)',     group: 'WB', side: 'R' },
  { code: 'DM',   label: 'Defensive Mid',     group: 'DM', side: null },
  { code: 'M_L',  label: 'Midfielder (L)',    group: 'M',  side: 'L' },
  { code: 'M_C',  label: 'Midfielder (C)',    group: 'M',  side: 'C' },
  { code: 'M_R',  label: 'Midfielder (R)',    group: 'M',  side: 'R' },
  { code: 'AM_L', label: 'Attacking Mid (L)', group: 'AM', side: 'L' },
  { code: 'AM_C', label: 'Attacking Mid (C)', group: 'AM', side: 'C' },
  { code: 'AM_R', label: 'Attacking Mid (R)', group: 'AM', side: 'R' },
  { code: 'ST_C', label: 'Striker',           group: 'ST', side: 'C' },
];
const POSITION_SLOT_MAP = Object.fromEntries(POSITION_SLOTS.map(p => [p.code, p]));

// Which "role set" each position code pulls its roles from.
const SLOT_ROLE_SET = {
  GK: 'GK', D_L: 'D_WIDE', D_C: 'D_C', D_R: 'D_WIDE',
  WB_L: 'WB', WB_R: 'WB', DM: 'DM', M_L: 'M_WIDE', M_C: 'M_C',
  M_R: 'M_WIDE', AM_L: 'AM_WIDE', AM_C: 'AM_C', AM_R: 'AM_WIDE', ST_C: 'ST',
};

// Groups close enough to count as "related" when judging how natural a
// player is in a slot they aren't directly trained in.
const RELATED_GROUPS = {
  GK: [], D: ['WB'], WB: ['D'], DM: ['D', 'M'],
  M: ['DM', 'AM'], AM: ['M'], ST: [],
};

// Duty shifts which of a role's attributes get extra emphasis, without
// changing the role's overall attribute profile.
const DUTY_EMPHASIS = {
  Defend: ['Marking', 'Tackling', 'Positioning', 'Concentration', 'Anticipation', 'Bravery'],
  Stopper: ['Tackling', 'Aggression', 'Anticipation', 'Bravery', 'Marking'],
  Cover: ['Positioning', 'Anticipation', 'Pace', 'Concentration', 'Marking'],
  Support: ['Passing', 'Vision', 'Work Rate', 'Team Work', 'Decisions', 'Stamina'],
  Attack: ['Off The Ball', 'Finishing', 'Acceleration', 'Composure', 'Dribbling', 'Anticipation'],
  Automatic: [],
};

// Attributes that get a small baseline weight on *every* role of the
// relevant kind (outfield or goalkeeper), on top of whatever a role's
// own key/preferable lists already give it. This is what makes scoring
// use the full attribute sheet rather than just each role's headline
// stats - a technically brilliant but bone-lazy player will still lose
// ground to a hard-working one with similar technical numbers.
const GENERAL_OUTFIELD_ATTRS = [
  'Decisions', 'Determination', 'Concentration', 'Anticipation', 'Composure',
  'Work Rate', 'Team Work', 'Natural Fitness', 'Stamina', 'Agility', 'Balance',
  'Strength', 'Pace', 'Acceleration', 'Vision', 'First Touch', 'Technique',
  'Positioning', 'Bravery', 'Aggression', 'Flair', 'Leadership',
];
const GENERAL_GK_ATTRS = [
  'Concentration', 'Decisions', 'Anticipation', 'Composure', 'Positioning',
  'Communication', 'Agility', 'Balance', 'Natural Fitness', 'Bravery',
];
const GENERAL_BASELINE_WEIGHT = 0.5;

// ---------------------------------------------------------------------
// Role sets. `key` attributes are weighted 3x, `pref` attributes 1x -
// on top of that, every role also gets a small baseline weight on the
// general attribute list above, so nothing on the sheet is ignored.
// ---------------------------------------------------------------------
const ROLE_SETS = {
  GK: [
    { id: 'GK', name: 'Goalkeeper', duties: ['Defend'],
      key: ['Reflexes', 'Handling', 'One On Ones', 'Positioning', 'Communication'],
      pref: ['Aerial Reach', 'Command Of Area', 'Kicking', 'Throwing', 'Punching'] },
    { id: 'SK', name: 'Sweeper Keeper', duties: ['Defend', 'Support'],
      key: ['Reflexes', 'Handling', 'One On Ones', 'Rushing Out (Tendency)', 'Passing'],
      pref: ['Command Of Area', 'Kicking', 'Aerial Reach', 'Vision', 'First Touch'] },
  ],
  D_C: [
    { id: 'CD', name: 'Central Defender', duties: ['Defend', 'Stopper', 'Cover'],
      key: ['Marking', 'Tackling', 'Positioning', 'Heading', 'Strength'],
      pref: ['Jumping Reach', 'Aggression', 'Passing'] },
    { id: 'BPD', name: 'Ball Playing Defender', duties: ['Defend', 'Stopper', 'Cover'],
      key: ['Marking', 'Tackling', 'Passing', 'Heading'],
      pref: ['Technique', 'Vision', 'Strength', 'Jumping Reach'] },
    { id: 'NCB', name: 'No-Nonsense Centre Back', duties: ['Defend'],
      key: ['Marking', 'Tackling', 'Heading', 'Strength'],
      pref: ['Jumping Reach'] },
    { id: 'LIB', name: 'Libero', duties: ['Defend', 'Support', 'Attack'],
      key: ['Marking', 'Tackling', 'Passing', 'Vision', 'Dribbling'],
      pref: ['Technique', 'Heading', 'Strength', 'Pace'] },
    { id: 'WCB', name: 'Wide Centre Back', duties: ['Defend', 'Support'],
      key: ['Marking', 'Tackling', 'Heading', 'Crossing', 'Pace'],
      pref: ['Dribbling', 'Passing', 'Strength'] },
  ],
  D_WIDE: [
    { id: 'FB', name: 'Full Back', duties: ['Defend', 'Support', 'Attack'],
      key: ['Marking', 'Tackling', 'Positioning', 'Pace'],
      pref: ['Crossing', 'Dribbling', 'Heading'] },
    { id: 'NNFB', name: 'No-Nonsense Full Back', duties: ['Defend'],
      key: ['Marking', 'Tackling', 'Positioning', 'Strength'],
      pref: ['Heading'] },
    { id: 'IFB', name: 'Inverted Full Back', duties: ['Defend', 'Support'],
      key: ['Passing', 'Marking', 'Tackling', 'Positioning'],
      pref: ['Vision', 'Technique'] },
    { id: 'WB', name: 'Wing Back', duties: ['Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Marking', 'Tackling'],
      pref: ['Dribbling', 'Technique'] },
    { id: 'IWB', name: 'Inverted Wing Back', duties: ['Defend', 'Support'],
      key: ['Passing', 'Positioning', 'Marking', 'Tackling'],
      pref: ['Vision', 'Technique'] },
    { id: 'CWB', name: 'Complete Wing Back', duties: ['Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Dribbling', 'Marking'],
      pref: ['Tackling', 'Technique', 'Long Shots'] },
  ],
  WB: [
    { id: 'WB', name: 'Wing Back', duties: ['Defend', 'Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Marking', 'Tackling'],
      pref: ['Dribbling', 'Technique'] },
    { id: 'CWB', name: 'Complete Wing Back', duties: ['Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Dribbling', 'Marking'],
      pref: ['Tackling', 'Technique', 'Long Shots'] },
    { id: 'IWB', name: 'Inverted Wing Back', duties: ['Defend', 'Support'],
      key: ['Passing', 'Positioning', 'Marking', 'Tackling'],
      pref: ['Vision', 'Technique'] },
    { id: 'NNFB', name: 'No-Nonsense Full Back', duties: ['Defend'],
      key: ['Marking', 'Tackling', 'Positioning', 'Strength'],
      pref: ['Heading'] },
  ],
  DM: [
    { id: 'DM', name: 'Defensive Midfielder', duties: ['Defend', 'Support'],
      key: ['Tackling', 'Marking', 'Positioning', 'Anticipation'],
      pref: ['Strength', 'Passing'] },
    { id: 'A', name: 'Anchor Man', duties: ['Defend'],
      key: ['Tackling', 'Marking', 'Positioning', 'Strength'],
      pref: [] },
    { id: 'HB', name: 'Half Back', duties: ['Defend'],
      key: ['Tackling', 'Marking', 'Positioning', 'Anticipation'],
      pref: ['Passing', 'Heading'] },
    { id: 'BWM', name: 'Ball Winning Midfielder', duties: ['Defend', 'Support'],
      key: ['Tackling', 'Aggression', 'Anticipation'],
      pref: ['Marking', 'Positioning', 'Strength'] },
    { id: 'DLP', name: 'Deep Lying Playmaker', duties: ['Defend', 'Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Marking', 'Tackling', 'Positioning'] },
    { id: 'REG', name: 'Regista', duties: ['Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Flair', 'Dribbling'] },
    { id: 'SV', name: 'Segundo Volante', duties: ['Support', 'Attack'],
      key: ['Stamina', 'Work Rate', 'Passing', 'Long Shots'],
      pref: ['Tackling', 'Dribbling', 'Off The Ball'] },
  ],
  M_C: [
    { id: 'CM', name: 'Central Midfielder', duties: ['Defend', 'Support', 'Attack'],
      key: ['Passing', 'Work Rate', 'Stamina'],
      pref: ['Tackling', 'Vision', 'Technique', 'Positioning'] },
    { id: 'B2B', name: 'Box to Box Midfielder', duties: ['Support'],
      key: ['Stamina', 'Work Rate', 'Passing', 'Tackling'],
      pref: ['Dribbling', 'Long Shots'] },
    { id: 'DLP', name: 'Deep Lying Playmaker', duties: ['Defend', 'Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Marking', 'Tackling', 'Positioning'] },
    { id: 'BWM', name: 'Ball Winning Midfielder', duties: ['Defend', 'Support'],
      key: ['Tackling', 'Aggression', 'Anticipation'],
      pref: ['Marking', 'Positioning', 'Strength'] },
    { id: 'MEZ', name: 'Mezzala', duties: ['Support', 'Attack'],
      key: ['Passing', 'Dribbling', 'Off The Ball', 'Technique'],
      pref: ['Long Shots', 'Vision'] },
    { id: 'CHM', name: 'Channel Midfielder', duties: ['Support', 'Attack'],
      key: ['Off The Ball', 'Dribbling', 'Acceleration', 'Pace'],
      pref: ['Passing', 'Finishing', 'Long Shots', 'Technique'] },
    { id: 'CAR', name: 'Carrilero', duties: ['Support'],
      key: ['Passing', 'Work Rate', 'Tackling', 'Positioning'],
      pref: ['Marking'] },
    { id: 'RPM', name: 'Roaming Playmaker', duties: ['Support'],
      key: ['Passing', 'Vision', 'Technique', 'Stamina'],
      pref: ['Dribbling', 'Work Rate', 'First Touch'] },
    { id: 'SV', name: 'Segundo Volante', duties: ['Support', 'Attack'],
      key: ['Stamina', 'Work Rate', 'Passing', 'Long Shots'],
      pref: ['Tackling', 'Dribbling', 'Off The Ball'] },
  ],
  M_WIDE: [
    { id: 'WM', name: 'Wide Midfielder', duties: ['Defend', 'Support', 'Attack'],
      key: ['Work Rate', 'Tackling', 'Crossing', 'Positioning'],
      pref: ['Passing', 'Marking', 'Pace'] },
    { id: 'WP', name: 'Wide Playmaker', duties: ['Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Crossing', 'Dribbling'] },
    { id: 'WI', name: 'Winger', duties: ['Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Dribbling', 'Technique'],
      pref: ['Off The Ball', 'Flair'] },
    { id: 'DW', name: 'Defensive Winger', duties: ['Defend'],
      key: ['Work Rate', 'Tackling', 'Marking', 'Positioning'],
      pref: ['Crossing', 'Pace'] },
  ],
  AM_WIDE: [
    { id: 'WI', name: 'Winger', duties: ['Support', 'Attack'],
      key: ['Pace', 'Crossing', 'Dribbling', 'Technique'],
      pref: ['Off The Ball', 'Flair'] },
    { id: 'IF', name: 'Inside Forward', duties: ['Support', 'Attack'],
      key: ['Dribbling', 'Finishing', 'Off The Ball', 'Pace'],
      pref: ['Technique', 'Long Shots'] },
    { id: 'IW', name: 'Inverted Winger', duties: ['Support', 'Attack'],
      key: ['Dribbling', 'Passing', 'Off The Ball', 'Pace'],
      pref: ['Crossing', 'Technique'] },
    { id: 'WP', name: 'Wide Playmaker', duties: ['Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Crossing', 'Dribbling'] },
    { id: 'RAU', name: 'Raumdeuter', duties: ['Attack'],
      key: ['Off The Ball', 'Finishing', 'Anticipation', 'Pace'],
      pref: ['Dribbling'] },
    { id: 'DW', name: 'Defensive Winger', duties: ['Defend'],
      key: ['Work Rate', 'Tackling', 'Marking', 'Positioning'],
      pref: ['Crossing', 'Pace'] },
  ],
  AM_C: [
    { id: 'AP', name: 'Advanced Playmaker', duties: ['Support', 'Attack'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Dribbling', 'Off The Ball'] },
    { id: 'AM', name: 'Attacking Midfielder', duties: ['Support', 'Attack'],
      key: ['Passing', 'Off The Ball', 'Technique', 'Long Shots'],
      pref: ['Dribbling', 'Vision'] },
    { id: 'SS', name: 'Shadow Striker', duties: ['Attack'],
      key: ['Off The Ball', 'Finishing', 'Anticipation'],
      pref: ['Dribbling', 'Long Shots', 'First Touch'] },
    { id: 'ENG', name: 'Enganche', duties: ['Support'],
      key: ['Passing', 'Vision', 'Technique', 'First Touch'],
      pref: ['Flair', 'Dribbling'] },
    { id: 'TRE', name: 'Trequartista', duties: ['Attack'],
      key: ['Flair', 'Technique', 'Dribbling', 'Vision'],
      pref: ['Passing', 'First Touch'] },
  ],
  ST: [
    { id: 'AF', name: 'Advanced Forward', duties: ['Attack'],
      key: ['Off The Ball', 'Finishing', 'Pace'],
      pref: ['Dribbling', 'First Touch', 'Strength'] },
    { id: 'POA', name: 'Poacher', duties: ['Attack'],
      key: ['Finishing', 'Anticipation', 'Off The Ball'],
      pref: ['First Touch'] },
    { id: 'DLF', name: 'Deep Lying Forward', duties: ['Support', 'Attack'],
      key: ['First Touch', 'Technique', 'Passing', 'Off The Ball'],
      pref: ['Vision', 'Strength', 'Heading'] },
    { id: 'CF', name: 'Complete Forward', duties: ['Support', 'Attack'],
      key: ['Finishing', 'First Touch', 'Off The Ball', 'Strength'],
      pref: ['Technique', 'Dribbling', 'Passing', 'Heading'] },
    { id: 'TF', name: 'Target Forward', duties: ['Support', 'Attack'],
      key: ['Heading', 'Strength', 'Jumping Reach'],
      pref: ['First Touch', 'Finishing'] },
    { id: 'F9', name: 'False Nine', duties: ['Support'],
      key: ['Passing', 'Technique', 'First Touch', 'Off The Ball'],
      pref: ['Dribbling', 'Vision'] },
    { id: 'PF', name: 'Pressing Forward', duties: ['Defend', 'Support', 'Attack'],
      key: ['Work Rate', 'Aggression', 'Off The Ball'],
      pref: ['Finishing', 'Strength'] },
    { id: 'CHF', name: 'Channel Forward', duties: ['Attack'],
      key: ['Pace', 'Off The Ball', 'Finishing', 'Dribbling'],
      pref: ['First Touch'] },
  ],
};

// ---------------------------------------------------------------------
// Grid formations. Each row (DEF/DM/MID/AM/ST) has 5 columns, indexed
// 0-4. Columns 0 and 4 are the wide slots; columns 1-3 are all "central"
// (so a back three, three central mids, etc. simply use several of
// them). A cell is either a plain column index (use the row's default
// position for that column) or {col, pos} to force a specific position
// code - used for things like wing-backs sitting on the DEF line.
// ---------------------------------------------------------------------
const GRID_ROW_ORDER = ['ST', 'AM', 'MID', 'DM', 'DEF', 'GK'];
const GRID_ROW_LABELS = {
  ST: 'Strikers', AM: 'Attacking Mid', MID: 'Midfield', DM: 'Defensive Mid', DEF: 'Defenders', GK: 'Goalkeeper',
};
// Default position code for a given row + column side ('L' | 'C' | 'R').
const GRID_ROW_DEFAULT_POSITION = {
  DEF: side => (side === 'L' ? 'D_L' : side === 'R' ? 'D_R' : 'D_C'),
  DM: () => 'DM',
  MID: side => (side === 'L' ? 'M_L' : side === 'R' ? 'M_R' : 'M_C'),
  AM: side => (side === 'L' ? 'AM_L' : side === 'R' ? 'AM_R' : 'AM_C'),
  ST: () => 'ST_C',
  GK: () => 'GK',
};
const GRID_COLUMN_SIDES = ['L', 'C', 'C', 'C', 'R'];

function defaultPositionForCell(rowKey, colIdx) {
  const side = GRID_COLUMN_SIDES[colIdx];
  return GRID_ROW_DEFAULT_POSITION[rowKey](side);
}

const GRID_FORMATIONS = {
  '4-4-2': { DEF: [0, 1, 3, 4], MID: [0, 1, 3, 4], ST: [1, 3] },
  '4-3-3': { DEF: [0, 1, 3, 4], DM: [2], MID: [1, 3], AM: [0, 4], ST: [2] },
  '4-2-3-1': { DEF: [0, 1, 3, 4], DM: [1, 3], AM: [0, 2, 4], ST: [2] },
  '3-5-2': { DEF: [{ col: 0, pos: 'WB_L' }, 1, 2, 3, { col: 4, pos: 'WB_R' }], DM: [2], MID: [1, 3], ST: [1, 3] },
  '5-3-2': { DEF: [{ col: 0, pos: 'WB_L' }, 1, 2, 3, { col: 4, pos: 'WB_R' }], MID: [1, 2, 3], ST: [1, 3] },
  '4-1-2-1-2': { DEF: [0, 1, 3, 4], DM: [2], MID: [1, 3], AM: [2], ST: [1, 3] },
};