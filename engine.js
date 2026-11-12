/**
 * FM27 Plus - tactical & squad-depth engine
 * FM27's own role database (in- and out-of-possession roles with their Key / Preferable attributes)
 */

// --- Pitch Matrix Position Definitions ---
const POSITION_SLOT_MAP = {
  GK:   { label: 'Goalkeeper', group: 'GK' },
  
  // Center & Wide Defense
  DL:   { label: 'Left Back', group: 'FB' },
  DCL:  { label: 'Center Back (Left)', group: 'DC' },
  DC:   { label: 'Center Back', group: 'DC' },
  DCR:  { label: 'Center Back (Right)', group: 'DC' },
  DR:   { label: 'Right Back', group: 'FB' },

  // Defensive Midfield & Wing Backs
  WBL:  { label: 'Wing Back (Left)', group: 'WB' },
  DMCL: { label: 'Defensive Mid (Left)', group: 'DM' },
  DMC:  { label: 'Defensive Mid', group: 'DM' },
  DMCR: { label: 'Defensive Mid (Right)', group: 'DM' },
  WBR:  { label: 'Wing Back (Right)', group: 'WB' },

  // Central & Wide Midfield
  ML:   { label: 'Left Mid', group: 'WM' },
  MCL:  { label: 'Central Mid (Left)', group: 'MC' },
  MC:   { label: 'Central Mid', group: 'MC' },
  MCR:  { label: 'Central Mid (Right)', group: 'MC' },
  MR:   { label: 'Right Mid', group: 'WM' },

  // Attacking Midfield & Wingers
  AML:  { label: 'Attacking Mid (Left)', group: 'AMW' },
  AMCL: { label: 'Attacking Mid (Center-Left)', group: 'AMC' },
  AMC:  { label: 'Attacking Mid (Center)', group: 'AMC' },
  AMCR: { label: 'Attacking Mid (Center-Right)', group: 'AMC' },
  AMR:  { label: 'Attacking Mid (Right)', group: 'AMW' },

  // Strikers
  STCL: { label: 'Striker (Left)', group: 'ST' },
  STC:  { label: 'Striker (Center)', group: 'ST' },
  STCR: { label: 'Striker (Right)', group: 'ST' }
};

// --- FM27 role database ---
//
// Read straight off the game's own player screens (Overview > the role list under the pitch): for every
// position, the in-possession (IP) and out-of-possession (OOP) roles FM27 offers, and for each role the
// attributes the game marks as Key and Preferable. Names are the game's own. A slot on the pitch gets one
// IP role and one OOP role, exactly like the game's tactic screen.
const ROLE_DATA = {"ip":{"Wing-Back":{"k":["Crossing","Marking","Tackling","Teamwork","Work Rate","Acceleration","Pace","Stamina"],"p":["Dribbling","First Touch","Passing","Technique","Anticipation","Concentration","Decisions","Off The Ball","Positioning","Agility","Balance"]},"Full-Back":{"k":["Marking","Tackling","Anticipation","Concentration","Positioning","Teamwork","Acceleration"],"p":["Crossing","Dribbling","Passing","Technique","Decisions","Work Rate","Agility","Pace","Stamina"]},"Inside Wing-Back":{"k":["Passing","Tackling","Anticipation","Composure","Decisions","Positioning","Teamwork","Acceleration"],"p":["First Touch","Marking","Technique","Concentration","Work Rate","Agility","Pace","Stamina"]},"Inside Full-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Strength"],"p":["Dribbling","Aggression","Bravery","Composure","Concentration","Decisions","Work Rate","Acceleration","Agility","Jumping Reach","Pace","Stamina"]},"Playmaking Wing-Back":{"k":["First Touch","Passing","Tackling","Technique","Composure","Decisions","Teamwork","Vision","Acceleration"],"p":["Crossing","Dribbling","Marking","Anticipation","Concentration","Off The Ball","Positioning","Work Rate","Agility","Pace","Stamina"]},"Advanced Wing-Back":{"k":["Crossing","Dribbling","Technique","Off The Ball","Teamwork","Work Rate","Acceleration","Agility","Pace","Stamina"],"p":["First Touch","Marking","Passing","Tackling","Anticipation","Decisions","Flair","Positioning","Balance"]},"Ball-Playing Centre-Back":{"k":["Heading","Marking","Passing","Tackling","Anticipation","Composure","Positioning","Jumping Reach","Strength"],"p":["First Touch","Technique","Aggression","Bravery","Concentration","Decisions","Vision","Pace"]},"Advanced Centre-Back":{"k":["Heading","Marking","Passing","Tackling","Technique","Anticipation","Composure","Decisions","Positioning","Teamwork","Jumping Reach","Strength"],"p":["Dribbling","First Touch","Aggression","Bravery","Concentration","Vision","Pace","Stamina"]},"Overlapping Centre-Back":{"k":["Crossing","Heading","Marking","Tackling","Anticipation","Work Rate","Jumping Reach","Pace","Stamina","Strength"],"p":["Dribbling","Technique","Aggression","Bravery","Composure","Concentration","Decisions","Off The Ball","Positioning","Acceleration","Agility"]},"No-Nonsense Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Jumping Reach","Strength"],"p":["Aggression","Bravery","Concentration","Pace"]},"Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Jumping Reach","Strength"],"p":["Aggression","Bravery","Composure","Concentration","Decisions","Pace"]},"Wide Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Jumping Reach","Strength"],"p":["Dribbling","Aggression","Bravery","Composure","Concentration","Decisions","Work Rate","Acceleration","Agility","Pace","Stamina"]},"Wide Central Midfielder":{"k":["First Touch","Passing","Tackling","Decisions","Teamwork"],"p":["Crossing","Dribbling","Technique","Anticipation","Composure","Concentration","Off The Ball","Positioning","Vision","Work Rate","Agility","Stamina"]},"Central Midfielder":{"k":["First Touch","Passing","Tackling","Decisions","Teamwork"],"p":["Technique","Anticipation","Composure","Concentration","Off The Ball","Positioning","Vision","Work Rate","Stamina"]},"Midfield Playmaker":{"k":["First Touch","Passing","Technique","Composure","Decisions","Off The Ball","Teamwork","Vision"],"p":["Dribbling","Tackling","Anticipation","Flair","Positioning","Work Rate","Agility","Stamina"]},"Advanced Playmaker":{"k":["First Touch","Passing","Technique","Composure","Decisions","Off The Ball","Teamwork","Vision"],"p":["Crossing","Dribbling","Anticipation","Flair","Acceleration","Agility"]},"Channel Midfielder":{"k":["Crossing","First Touch","Passing","Technique","Composure","Off The Ball","Work Rate","Acceleration"],"p":["Dribbling","Long Shots","Anticipation","Decisions","Flair","Vision","Agility","Pace","Stamina"]},"Attacking Midfielder":{"k":["First Touch","Long Shots","Passing","Technique","Composure","Flair","Off The Ball"],"p":["Crossing","Dribbling","Finishing","Anticipation","Decisions","Vision","Acceleration","Agility"]},"Deep-Lying Playmaker":{"k":["First Touch","Passing","Technique","Composure","Decisions","Teamwork","Vision"],"p":["Marking","Tackling","Anticipation","Concentration","Off The Ball","Positioning","Work Rate","Balance","Stamina"]},"Defensive Midfielder":{"k":["Tackling","Anticipation","Concentration","Positioning","Teamwork"],"p":["First Touch","Marking","Passing","Aggression","Composure","Decisions","Work Rate","Stamina","Strength"]},"Box-To-Box Playmaker":{"k":["First Touch","Passing","Technique","Composure","Decisions","Off The Ball","Teamwork","Vision","Work Rate","Stamina"],"p":["Dribbling","Long Shots","Marking","Tackling","Anticipation","Positioning","Acceleration","Agility","Balance","Pace"]},"Box-To-Box Midfielder":{"k":["Passing","Tackling","Off The Ball","Teamwork","Work Rate","Stamina"],"p":["Dribbling","Finishing","First Touch","Long Shots","Technique","Aggression","Anticipation","Composure","Decisions","Positioning","Acceleration","Balance","Pace","Strength"]},"Half Back":{"k":["Heading","Marking","Tackling","Anticipation","Concentration","Positioning","Teamwork","Jumping Reach","Strength"],"p":["First Touch","Passing","Aggression","Bravery","Composure","Decisions","Work Rate","Stamina"]},"Wide Midfielder":{"k":["Crossing","Passing","Technique","Decisions","Teamwork","Work Rate","Pace","Stamina"],"p":["Dribbling","First Touch","Anticipation","Composure","Off The Ball","Vision","Acceleration","Agility"]},"Inside Winger":{"k":["Dribbling","First Touch","Technique","Composure","Teamwork","Acceleration","Agility"],"p":["Crossing","Long Shots","Passing","Anticipation","Flair","Off The Ball","Vision","Work Rate","Balance","Pace","Stamina"]},"Winger":{"k":["Crossing","Dribbling","Technique","Teamwork","Acceleration","Agility","Pace"],"p":["First Touch","Passing","Anticipation","Flair","Off The Ball","Work Rate","Balance","Stamina"]},"Playmaking Winger":{"k":["Crossing","Dribbling","First Touch","Passing","Technique","Composure","Decisions","Off The Ball","Teamwork","Vision","Acceleration"],"p":["Anticipation","Flair","Work Rate","Agility","Pace","Stamina"]},"Inside Forward":{"k":["Dribbling","First Touch","Technique","Anticipation","Composure","Off The Ball","Acceleration","Agility"],"p":["Crossing","Finishing","Long Shots","Passing","Flair","Vision","Work Rate","Balance","Pace","Stamina"]},"Wide Forward":{"k":["Dribbling","First Touch","Technique","Anticipation","Off The Ball","Acceleration","Agility","Pace"],"p":["Crossing","Finishing","Passing","Composure","Flair","Work Rate","Balance","Stamina"]},"Free Role":{"k":["Dribbling","First Touch","Long Shots","Passing","Technique","Composure","Flair","Off The Ball","Vision"],"p":["Crossing","Finishing","Anticipation","Decisions","Acceleration","Agility"]},"Second Striker":{"k":["Finishing","First Touch","Anticipation","Composure","Off The Ball","Acceleration"],"p":["Dribbling","Long Shots","Passing","Technique","Concentration","Decisions","Work Rate","Agility","Pace","Stamina"]},"Poacher":{"k":["Finishing","Heading","Anticipation","Composure","Concentration","Off The Ball","Acceleration"],"p":["First Touch","Technique","Decisions","Balance"]},"Centre Forward":{"k":["Finishing","First Touch","Heading","Technique","Composure","Off The Ball","Acceleration","Strength"],"p":["Dribbling","Passing","Anticipation","Decisions","Agility","Balance","Jumping Reach","Pace"]},"Channel Forward":{"k":["Dribbling","Finishing","First Touch","Technique","Composure","Off The Ball","Work Rate","Acceleration"],"p":["Crossing","Heading","Passing","Anticipation","Decisions","Agility","Balance","Pace","Stamina"]},"Deep-Lying Forward":{"k":["Finishing","First Touch","Technique","Composure","Off The Ball","Strength"],"p":["Dribbling","Passing","Anticipation","Decisions","Teamwork","Vision","Balance"]},"False Nine":{"k":["Dribbling","First Touch","Passing","Technique","Composure","Decisions","Off The Ball","Teamwork","Vision","Acceleration"],"p":["Finishing","Anticipation","Flair","Agility","Balance"]},"Target Forward":{"k":["Finishing","Heading","Aggression","Bravery","Composure","Off The Ball","Balance","Jumping Reach","Strength"],"p":["First Touch","Anticipation","Decisions","Teamwork"]},"Goalkeeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","Reflexes","Concentration","Positioning","Agility"],"p":["Kicking","One On Ones","Throwing","Anticipation","Decisions"]},"No-Nonsense Goalkeeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","Reflexes","Concentration","Positioning","Agility"],"p":["One On Ones","Anticipation","Decisions"]},"Ball-Playing Goalkeeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","Kicking","Reflexes","Concentration","Positioning","Agility"],"p":["Eccentricity","One On Ones","Passing","Throwing","Anticipation","Composure","Decisions"]}},"oop":{"Pressing Full-Back":{"k":["Marking","Tackling","Aggression","Anticipation","Positioning","Teamwork","Work Rate","Acceleration"],"p":["Bravery","Concentration","Decisions","Agility","Pace","Stamina"]},"Full-Back":{"k":["Marking","Tackling","Anticipation","Positioning","Teamwork","Acceleration"],"p":["Aggression","Concentration","Decisions","Work Rate","Agility","Pace","Stamina"]},"Holding Full-Back":{"k":["Marking","Tackling","Anticipation","Concentration","Decisions","Positioning","Acceleration"],"p":["Teamwork","Agility","Pace"]},"Wing-Back":{"k":["Marking","Tackling","Anticipation","Positioning","Teamwork","Acceleration","Stamina"],"p":["Aggression","Concentration","Decisions","Work Rate","Agility","Pace"]},"Pressing Wing-Back":{"k":["Marking","Tackling","Aggression","Anticipation","Positioning","Teamwork","Work Rate","Acceleration","Stamina"],"p":["Bravery","Concentration","Decisions","Agility","Pace"]},"Holding Wing-Back":{"k":["Marking","Tackling","Anticipation","Concentration","Decisions","Positioning","Acceleration"],"p":["Teamwork","Agility","Pace","Stamina"]},"Stopping Centre-Back":{"k":["Heading","Marking","Tackling","Aggression","Anticipation","Bravery","Positioning","Jumping Reach","Strength"],"p":["Concentration","Decisions","Pace"]},"Wide Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Jumping Reach","Strength"],"p":["Aggression","Bravery","Concentration","Decisions","Acceleration","Agility","Pace"]},"Stopping Wide Centre-Back":{"k":["Heading","Marking","Tackling","Aggression","Anticipation","Bravery","Positioning","Jumping Reach","Strength"],"p":["Concentration","Decisions","Acceleration","Agility","Pace"]},"Covering Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Concentration","Decisions","Positioning","Jumping Reach","Pace","Strength"],"p":["Bravery","Acceleration"]},"Covering Wide Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Concentration","Decisions","Positioning","Jumping Reach","Pace","Strength"],"p":["Bravery","Acceleration","Agility"]},"Centre-Back":{"k":["Heading","Marking","Tackling","Anticipation","Positioning","Jumping Reach","Strength"],"p":["Aggression","Bravery","Composure","Concentration","Decisions","Pace"]},"Screening Central Midfielder":{"k":["Marking","Tackling","Concentration","Decisions","Positioning"],"p":["Anticipation","Teamwork","Work Rate","Stamina"]},"Pressing Central Midfielder":{"k":["Tackling","Aggression","Anticipation","Decisions","Teamwork","Work Rate","Stamina"],"p":["Marking","Concentration","Positioning","Pace","Strength"]},"Wide Covering Central Midfielder":{"k":["Marking","Tackling","Decisions","Teamwork","Work Rate","Agility","Stamina"],"p":["Aggression","Anticipation","Concentration","Positioning","Pace"]},"Central Midfielder":{"k":["Tackling","Decisions","Teamwork","Work Rate"],"p":["Marking","Aggression","Anticipation","Concentration","Positioning","Stamina"]},"Defensive Midfielder":{"k":["Tackling","Anticipation","Decisions","Positioning","Teamwork","Work Rate"],"p":["Marking","Aggression","Concentration","Stamina","Strength"]},"Screening Defensive Midfielder":{"k":["Marking","Tackling","Anticipation","Concentration","Decisions","Positioning"],"p":["Teamwork","Work Rate","Stamina","Strength"]},"Dropping Defensive Midfielder":{"k":["Marking","Tackling","Anticipation","Concentration","Decisions","Positioning","Teamwork","Work Rate","Jumping Reach","Strength"],"p":["Aggression","Stamina"]},"Pressing Defensive Midfielder":{"k":["Tackling","Aggression","Anticipation","Decisions","Positioning","Teamwork","Work Rate","Stamina"],"p":["Marking","Concentration","Pace","Strength"]},"Wide Covering Defensive Midfielder":{"k":["Marking","Tackling","Anticipation","Decisions","Positioning","Teamwork","Work Rate","Agility","Stamina"],"p":["Aggression","Concentration","Pace","Strength"]},"Wide Midfielder":{"k":["Decisions","Teamwork","Work Rate","Acceleration"],"p":["Marking","Aggression","Anticipation","Off The Ball","Agility","Pace","Stamina"]},"Tracking Wide Midfielder":{"k":["Aggression","Anticipation","Decisions","Teamwork","Work Rate","Acceleration","Stamina"],"p":["Marking","Tackling","Off The Ball","Positioning","Agility","Pace"]},"Wide Outlet Wide Midfielder":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Pace"],"p":["Dribbling","First Touch","Marking","Composure","Acceleration","Agility"]},"Winger":{"k":["Anticipation","Decisions","Teamwork","Work Rate","Acceleration"],"p":["Marking","Aggression","Off The Ball","Agility","Pace","Stamina"]},"Tracking Winger":{"k":["Aggression","Anticipation","Decisions","Teamwork","Work Rate","Acceleration","Stamina"],"p":["Marking","Tackling","Off The Ball","Positioning","Agility","Pace"]},"Inside Outlet Winger":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Balance"],"p":["Dribbling","First Touch","Marking","Composure","Acceleration","Strength"]},"Wide Outlet Winger":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Pace"],"p":["Dribbling","First Touch","Marking","Composure","Acceleration","Agility"]},"Attacking Midfielder":{"k":["Anticipation","Decisions","Work Rate"],"p":["Marking","Aggression","Off The Ball","Teamwork","Stamina"]},"Tracking Attacking Midfielder":{"k":["Aggression","Anticipation","Decisions","Teamwork","Work Rate","Stamina"],"p":["Marking","Off The Ball","Positioning"]},"Central Outlet Attacking Midfielder":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Balance"],"p":["First Touch","Marking","Composure","Strength"]},"Splitting Outlet Attacking Midfielder":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Pace"],"p":["First Touch","Marking","Composure","Acceleration"]},"Centre Forward":{"k":["Anticipation","Decisions","Work Rate"],"p":["Marking","Aggression","Off The Ball","Teamwork","Stamina"]},"Splitting Outlet Centre Forward":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Pace"],"p":["First Touch","Marking","Composure","Acceleration"]},"Central Outlet Centre Forward":{"k":["Anticipation","Concentration","Decisions","Off The Ball","Teamwork","Balance"],"p":["First Touch","Marking","Composure","Strength"]},"Tracking Centre Forward":{"k":["Aggression","Anticipation","Decisions","Teamwork","Work Rate","Stamina"],"p":["Marking","Off The Ball","Positioning"]},"Goalkeeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","Reflexes","Concentration","Positioning","Agility"],"p":["One On Ones","Rushing Out (Tendency)","Anticipation","Decisions"]},"Sweeper Keeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","One On Ones","Reflexes","Rushing Out (Tendency)","Anticipation","Decisions","Agility"],"p":["Eccentricity","Concentration","Positioning","Acceleration"]},"Line-Holding Goalkeeper":{"k":["Aerial Reach","Command Of Area","Communication","Handling","Reflexes","Concentration","Positioning","Agility"],"p":["One On Ones","Anticipation","Decisions"]}}};
const ROLE_LISTS = {"GK":{"ip":["Goalkeeper","Ball-Playing Goalkeeper","No-Nonsense Goalkeeper"],"oop":["Goalkeeper","Sweeper Keeper","Line-Holding Goalkeeper"]},"FB":{"ip":["Full-Back","Wing-Back","Inside Full-Back","Inside Wing-Back","Playmaking Wing-Back"],"oop":["Full-Back","Pressing Full-Back","Holding Full-Back"]},"WB":{"ip":["Wing-Back","Advanced Wing-Back","Inside Wing-Back","Playmaking Wing-Back"],"oop":["Wing-Back","Pressing Wing-Back","Holding Wing-Back"]},"DC":{"ip":["Centre-Back","Ball-Playing Centre-Back","Advanced Centre-Back","Overlapping Centre-Back","No-Nonsense Centre-Back","Wide Centre-Back"],"oop":["Centre-Back","Stopping Centre-Back","Covering Centre-Back","Wide Centre-Back","Stopping Wide Centre-Back","Covering Wide Centre-Back"]},"DM":{"ip":["Defensive Midfielder","Deep-Lying Playmaker","Box-To-Box Midfielder","Box-To-Box Playmaker","Half Back"],"oop":["Defensive Midfielder","Screening Defensive Midfielder","Dropping Defensive Midfielder","Pressing Defensive Midfielder","Wide Covering Defensive Midfielder"]},"MC":{"ip":["Central Midfielder","Midfield Playmaker","Advanced Playmaker","Wide Central Midfielder","Channel Midfielder","Attacking Midfielder"],"oop":["Central Midfielder","Screening Central Midfielder","Pressing Central Midfielder","Wide Covering Central Midfielder"]},"WM":{"ip":["Wide Midfielder","Winger","Inside Winger","Playmaking Winger"],"oop":["Wide Midfielder","Tracking Wide Midfielder","Wide Outlet Wide Midfielder"]},"AMW":{"ip":["Winger","Inside Winger","Inside Forward","Wide Forward","Playmaking Winger"],"oop":["Winger","Tracking Winger","Inside Outlet Winger","Wide Outlet Winger"]},"AMC":{"ip":["Attacking Midfielder","Advanced Playmaker","Channel Midfielder","Free Role","Second Striker"],"oop":["Attacking Midfielder","Tracking Attacking Midfielder","Central Outlet Attacking Midfielder","Splitting Outlet Attacking Midfielder"]},"ST":{"ip":["Centre Forward","Poacher","Channel Forward","Deep-Lying Forward","False Nine","Target Forward"],"oop":["Centre Forward","Tracking Centre Forward","Central Outlet Centre Forward","Splitting Outlet Centre Forward"]}};

// Same 54 attributes, in the order the live-data reader delivers them (the two foot slots are handled apart).
const ATTR_ORDER = [
  'Crossing', 'Dribbling', 'Finishing', 'Heading', 'Long Shots', 'Marking', 'Off The Ball', 'Passing', 'Penalty Taking',
  'Tackling', 'Vision', 'Handling', 'Aerial Reach', 'Command Of Area', 'Communication', 'Kicking', 'Throwing',
  'Anticipation', 'Decisions', 'One On Ones', 'Positioning', 'Reflexes', 'First Touch', 'Technique', '_LeftFoot', '_RightFoot',
  'Flair', 'Corners', 'Team Work', 'Work Rate', 'Long Throws', 'Eccentricity', 'Rushing Out (Tendency)', 'Punching',
  'Acceleration', 'Free Kick Taking', 'Strength', 'Stamina', 'Pace', 'Jumping Reach', 'Leadership', 'Dirtiness', 'Balance',
  'Bravery', 'Consistency', 'Aggression', 'Agility', 'Important Matches', 'Injury Proneness', 'Versatility', 'Natural Fitness',
  'Determination', 'Composure', 'Concentration',
];

/** Spelling-proof key for an attribute name ("Team Work" = "Teamwork", "Punching (Tendency)" = "Punching"). */
function attrKey(name) {
  return String(name).toLowerCase().replace(/\(tendency\)/g, '').replace(/[^a-z]/g, '');
}
const ATTR_INDEX = {};
ATTR_ORDER.forEach((n, i) => { ATTR_INDEX[attrKey(n)] = i; });

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function familyOf(positionCode) {
  return (POSITION_SLOT_MAP[positionCode] || { group: 'MC' }).group;
}

const ROLE_CACHE = {};
/** One role of one phase ('ip' / 'oop') by name, with its attribute lists resolved to vector indexes. */
function compileRole(phase, name) {
  const id = phase + ':' + name;
  if (ROLE_CACHE[id]) return ROLE_CACHE[id];
  const d = ROLE_DATA[phase] && ROLE_DATA[phase][name];
  if (!d) return null;
  const idx = (list) => list.map(n => ATTR_INDEX[attrKey(n)]).filter(i => i !== undefined);
  ROLE_CACHE[id] = { id, name, phase, keyAttrs: d.k, prefAttrs: d.p, keyIdx: idx(d.k), prefIdx: idx(d.p) };
  return ROLE_CACHE[id];
}

/** The roles FM27 offers at a pitch position for one phase ('ip' or 'oop'). */
function GET_ROLES_FOR_POSITION(positionCode, phase) {
  const fam = ROLE_LISTS[familyOf(positionCode)] || ROLE_LISTS.MC;
  return fam[phase || 'ip'].map(n => compileRole(phase || 'ip', n));
}

function getRoleById(id) {
  const s = String(id || '');
  const at = s.indexOf(':');
  return at < 0 ? null : compileRole(s.slice(0, at), s.slice(at + 1));
}

function defaultRoleIds(positionCode) {
  const fam = ROLE_LISTS[familyOf(positionCode)] || ROLE_LISTS.MC;
  return { ipRoleId: 'ip:' + fam.ip[0], oopRoleId: 'oop:' + fam.oop[0] };
}

const SLOT_ROLE_CACHE = new WeakMap();
/** A slot is { positionCode, ipRoleId, oopRoleId }. This puts both roles into one object for display. */
function slotRole(slot) {
  const key = slot.ipRoleId + '|' + slot.oopRoleId;
  const hit = SLOT_ROLE_CACHE.get(slot);
  if (hit && hit.key === key) return hit.role;
  const d = defaultRoleIds(slot.positionCode);
  const ip = getRoleById(slot.ipRoleId) || getRoleById(d.ipRoleId);
  const oop = getRoleById(slot.oopRoleId) || getRoleById(d.oopRoleId);
  const role = { id: ip.id + '|' + oop.id, name: ip.name === oop.name ? ip.name : ip.name + ' / ' + oop.name, ip, oop };
  SLOT_ROLE_CACHE.set(slot, { key, role });
  return role;
}

/** Saved formations from older versions had one role + a duty: map them to the nearest FM27 pair. */
function migrateSlot(slot) {
  if (slot.ipRoleId && slot.oopRoleId && getRoleById(slot.ipRoleId) && getRoleById(slot.oopRoleId)) return slot;
  const d = defaultRoleIds(slot.positionCode);
  return { positionCode: slot.positionCode, ipRoleId: d.ipRoleId, oopRoleId: d.oopRoleId };
}

// --- Numeric attribute vectors ---
//
// A player's attributes as a Float32Array in ATTR_ORDER (the 1-100 game scale divided by 5, so 13.8 not
// "14"); NaN where unknown. The live-data bridge fills player._v directly; CSV imports are parsed once here.
function vecOf(player) {
  if (player._v) return player._v;
  const v = new Float32Array(ATTR_ORDER.length).fill(NaN);
  const src = player.raw || {};
  Object.keys(src).forEach(k => {
    const idx = ATTR_INDEX[attrKey(k)];
    if (idx === undefined || ATTR_ORDER[idx].charAt(0) === '_') return;
    const n = parseFloat(src[k]);
    if (!isNaN(n)) v[idx] = n;
  });
  player._v = v;
  return v;
}

// --- Position familiarity (the game's own 1-20 ratings) ---
const RATING_INDEX = { GK: 0, SW: 1, DL: 2, DC: 3, DR: 4, DM: 5, ML: 6, MC: 7, MR: 8, AML: 9, AMC: 10, AMR: 11, STC: 12, WBL: 13, WBR: 14 };
const SLOT_TO_RATING = {
  GK: 'GK', DL: 'DL', DCL: 'DC', DC: 'DC', DCR: 'DC', DR: 'DR', WBL: 'WBL', WBR: 'WBR',
  DMCL: 'DM', DMC: 'DM', DMCR: 'DM', ML: 'ML', MCL: 'MC', MC: 'MC', MCR: 'MC', MR: 'MR',
  AML: 'AML', AMCL: 'AMC', AMC: 'AMC', AMCR: 'AMC', AMR: 'AMR', STCL: 'STC', STC: 'STC', STCR: 'STC',
};

/** Familiarity label for a 1-20 rating, in the game's words (the profile's pitch tooltips). */
function familiarityTier(r) {
  if (r >= 20) return { tier: 'natural', label: 'Natural' };
  if (r >= 15) return { tier: 'accomplished', label: 'Accomplished' };
  if (r >= 10) return { tier: 'competent', label: 'Competent' };
  if (r >= 5) return { tier: 'unconvincing', label: 'Unconvincing' };
  if (r >= 2) return { tier: 'awkward', label: 'Awkward' };
  return { tier: 'ineffectual', label: 'Ineffectual' };
}

/** What playing a position costs, in attribute points (on the 1-20 scale) off his rating there: 0 at 20, 0.5 at 15,
 * 2.0 at 10, 4.5 at 5, 7.2 at 1. Calibrated on Fm-Match-Lab Study 5 (FM27 27.0.1, 300 replays per condition):
 * capping a team's starters at 15 in their positions cost 0.26 points per game (-0.22 xGD), capping them at 10 cost
 * 0.85 (-1.03 xGD) - about half a point and two points on every attribute the engine rewards. So Accomplished costs
 * little and the cost then grows quickly; nothing was measured below 10, the curve just continues. */
const POSITION_COST_AT_10 = 2.0;
function positionCost20(r) {
  const gap = (20 - clamp(r, 1, 20)) / 10;
  return POSITION_COST_AT_10 * gap * gap;
}

/** The same cost as a multiplier for a typical player (fit 13/20) - for the places that need a factor. */
function familiarityPenalty(r) {
  return 1 - positionCost20(r) / 13;
}

/** A 1-20 fit after the position cost (a CSV import, which has no 1-20 ratings, keeps its tier multiplier). */
function applyPosition(fit20, fam) {
  if (fit20 === null || fit20 === undefined) return fit20;
  return fam && fam.cost20 !== undefined ? Math.max(1, fit20 - fam.cost20) : fit20 * (fam ? fam.penalty : 1);
}

/** Out of position = Unconvincing or worse (below 10): what the "hide unfamiliar" switch removes. */
function isUnfamiliar(fam) {
  return !!fam && (fam.tier === 'unconvincing' || fam.tier === 'awkward' || fam.tier === 'ineffectual' || fam.tier === 'foreign');
}

function familiarityFor(player, positionCode) {
  if (player.ratings) {
    const code = SLOT_TO_RATING[positionCode] || 'MC';
    const r = player.ratings[RATING_INDEX[code]] || 1;
    const t = familiarityTier(r);
    return { tier: t.tier, label: t.label, rating: r, cost20: Math.round(positionCost20(r) * 100) / 100,
      penalty: Math.round(familiarityPenalty(r) * 1000) / 1000 };
  }
  return calculateFamiliarity(player.info.Position, positionCode);     // CSV import: position text only
}

// --- Footedness ---
//
// Feet are 1-20 (the bridge supplies player.feet); a CSV export's descriptive bands map onto the same scale.
const FOOT_STRENGTH = { 'Very Weak': 2, 'Weak': 5, 'Reasonable': 10, 'Fairly Strong': 14, 'Strong': 17, 'Very Strong': 20 };

function footRating(player, side) {
  if (player.feet) return side === 'R' ? player.feet.r : player.feet.l;
  const raw = player.raw['Right Foot'] !== undefined || player.raw['Left Foot'] !== undefined
    ? player.raw[side === 'R' ? 'Right Foot' : 'Left Foot'] : undefined;
  return FOOT_STRENGTH[raw] !== undefined ? FOOT_STRENGTH[raw] : 10;
}

// Which foot an in-possession role wants on its own side of the pitch: the matching foot (overlap / cross), the
// other one (cut inside onto the stronger foot), or either. Anything not listed is not footedness-sensitive.
const ROLE_FOOT_PREF = {
  'Wing-Back': 'same', 'Advanced Wing-Back': 'same', 'Full-Back': 'same', 'Winger': 'same', 'Wide Midfielder': 'same',
  'Inside Forward': 'opposite', 'Inside Winger': 'opposite', 'Wide Forward': 'opposite',
  'Inside Wing-Back': 'either', 'Inside Full-Back': 'either', 'Playmaking Wing-Back': 'either', 'Playmaking Winger': 'either',
};

/** Small multiplier (never more than ~7%) rewarding the right foot for the role and side. */
function footMultiplierFor(player, slotSide, ipRole) {
  const rf = footRating(player, 'R');
  const lf = footRating(player, 'L');
  const pref = ipRole ? ROLE_FOOT_PREF[ipRole.name] : null;

  if (!slotSide || !pref) {
    const avg = (rf + lf) / 2;
    return clamp(0.98 + ((avg - 10) / 10) * 0.02, 0.96, 1.02);
  }
  if (pref === 'either') {
    const best = Math.max(rf, lf);
    return clamp(0.97 + ((best - 10) / 10) * 0.03, 0.95, 1.03);
  }
  const sameFoot = slotSide === 'R' ? rf : lf;
  const oppFoot = slotSide === 'R' ? lf : rf;
  const relevant = pref === 'same' ? sameFoot : oppFoot;
  return clamp(0.93 + ((relevant - 10) / 10) * 0.07, 0.90, 1.07);
}

// --- Hidden factors: availability ---
//
// Fm-Match-Lab's studies (FM27 27.0.1, real matches replayed thousands of times) found no in-match effect from
// most of what is hidden: Consistency, Important Matches, Determination, Decisions, Versatility, current ability,
// reputation, Player Buy-In and most personality fields all moved nothing measurable, and Natural Fitness is not read
// during a match at all. What does matter enormously is a player's state going into it - match sharpness at 50% cost a
// full point per game, condition at 80% cost 0.8 (Study 5) - and over a season that depends on staying fit and
// recovering: Injury Proneness and Natural Fitness. So the only hidden adjustment left is that availability, up to the
// strength set in the toolbar. The rest is still shown on the player's profile, but no longer moves his rating.
const HIDDEN_STRENGTH = { off: 0, low: 0.03, normal: 0.05, high: 0.10 };
const HIDDEN_NEUTRAL = 0.60;

/** The game's own Player Tactical Ability (0-100): the median of Anticipation, Decisions, Composure, Concentration
 * and Versatility on the 1-20 scale, minus 1, times 100/19. Decoded from the match engine's effectiveness record and
 * exact for all 44 players checked (Fm-Match-Lab Study 3). It feeds tactical familiarity, but only through the median. */
function tacticalAbility(player) {
  const v = vecOf(player);
  const xs = ['Anticipation', 'Decisions', 'Composure', 'Concentration', 'Versatility']
    .map(n => v[ATTR_INDEX[attrKey(n)]]).filter(x => x === x);
  if (xs.length < 3) return null;
  xs.sort((a, b) => a - b);
  const m = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return Math.round(clamp((m - 1) * 100 / 19, 0, 100));
}

function hiddenProfile(player) {
  if (player._hp) return player._hp;
  const v = vecOf(player);
  const at = (name) => { const x = v[ATTR_INDEX[attrKey(name)]]; return x === x ? x : null; };
  const pe = (name) => getAttributeValue(player, name);
  const inv = (x) => (x === null ? null : 21 - x);
  const mix = (parts) => {
    let s = 0, w = 0;
    parts.forEach(([x, wt]) => { if (x !== null && x !== undefined) { s += x * wt; w += wt; } });
    return w > 0 ? s / w / 20 : null;
  };
  const p = {
    availability: mix([[inv(at('Injury Proneness')), 0.6], [at('Natural Fitness'), 0.4]]),
    tacticalAbility: tacticalAbility(player),
    // shown for interest only: the game's panel counts it, the match showed no effect from it (Study 3)
    buyIn: mix([[pe('Professionalism'), 0.35], [pe('Adaptability'), 0.2], [pe('Loyalty'), 0.15], [pe('Temperament'), 0.15], [at('Determination'), 0.15]]),
  };
  p.composite = p.availability === null ? HIDDEN_NEUTRAL : p.availability;
  player._hp = p;
  return p;
}

/** 1.00 for ordinary availability; up to 1 +/- strength for an exceptionally robust / fragile player. */
function hiddenMultiplier(player, strength) {
  if (!strength) return 1;
  const c = hiddenProfile(player).composite;
  return 1 + strength * clamp((c - HIDDEN_NEUTRAL) / 0.40, -1, 1);
}

// --- What the match engine rewards (Fm-Match-Lab, https://github.com/caiograco289/Fm-Match-Lab) ---
//
// Studies 1 and 2 moved each attribute by -5 and +5 for a whole squad and replayed ten real matches 30 times each on
// FM27's own engine (27.0.1; 27.0 agrees at r = 0.98). The weight is the effect on the team's xG difference per
// in-game point, kept only where it is clear (|t| >= 2) and the same on both engine versions. Finishing barely changes
// xG but converts chances (+0.04 goals above xG per point), and Pace converts too (+0.03), so that is added. Everything
// else - Passing, Technique, First Touch, Crossing, Tackling, Marking, Positioning, Decisions, Teamwork, Flair... -
// showed no clear effect. These are whole-squad, position-free values from one club (a promoted Premier League side),
// so by default they are blended with the role fit rather than replacing it (see RATING_MODELS).
const ENGINE_WEIGHTS = {
  'Pace': 0.132, 'Acceleration': 0.094, 'Jumping Reach': 0.068, 'Stamina': 0.059, 'Anticipation': 0.049,
  'Dribbling': 0.047, 'Concentration': 0.044, 'Finishing': 0.040, 'Balance': 0.033, 'Composure': 0.028,
  'Work Rate': 0.021, 'Vision': 0.018,
};
// Points per game for the whole squad per in-game point of each weighted attribute (Study 1, same order); summed, one
// point on all of them is worth about 0.36 points per game for a team, so about 0.032 for one starter.
const ENGINE_PPG = {
  'Pace': 0.071, 'Acceleration': 0.066, 'Jumping Reach': 0.033, 'Stamina': 0.036, 'Anticipation': 0.023,
  'Dribbling': 0.034, 'Concentration': 0.018, 'Finishing': 0.021, 'Balance': -0.004, 'Composure': 0.016,
  'Work Rate': 0.025, 'Vision': 0.016,
};
const STARTER_PPG_PER_POINT = Object.values(ENGINE_PPG).reduce((a, b) => a + b, 0) / 11;
const ENGINE_IDX = Object.keys(ENGINE_WEIGHTS).map(n => [ATTR_INDEX[attrKey(n)], ENGINE_WEIGHTS[n], n]);

/** How much of the rating comes from the match-engine fit: 0 = role fit only (the game's star ratings), 1 = engine
 * fit only. Goalkeepers always use the role fit: the studies changed whole squads, so they say little about keepers. */
const RATING_MODELS = { role: 0, blend: 0.5, engine: 1 };

/** Match-engine fit on the 1-20 scale: his attributes weighted by what they are worth in a match (ENGINE_WEIGHTS).
 * Null when less than half of that weight is known (a CSV export without those columns). */
function engineFit20(player) {
  if (player._ef !== undefined) return player._ef;
  const v = vecOf(player);
  let s = 0, w = 0, total = 0;
  for (let i = 0; i < ENGINE_IDX.length; i++) {
    const [idx, wt] = ENGINE_IDX[i];
    total += wt;
    const x = v[idx];
    if (x === x) { s += x * wt; w += wt; }
  }
  player._ef = w >= total / 2 ? s / w : null;
  return player._ef;
}

/** The attributes behind a player's engine fit, biggest share first: [{name, value, weight, share}]. */
function engineDrivers(player) {
  const v = vecOf(player);
  const out = [];
  ENGINE_IDX.forEach(([idx, wt, name]) => {
    const x = v[idx];
    if (x === x) out.push({ name, value: x, weight: wt });
  });
  const tot = out.reduce((s, d) => s + d.weight * d.value, 0) || 1;
  out.forEach(d => { d.share = d.weight * d.value / tot; });
  return out.sort((a, b) => b.weight - a.weight);
}

// --- Position Familiarity & Penalty System ---
//
// The previous version of this matched strings like "DC" against the
// player's raw position field ("D (C)") directly - since FM's own export
// format always has a space and parentheses in it, that literal
// substring never actually occurs, so genuinely natural players could
// never reach the "Natural" tier and were silently downgraded to
// "Accomplished" every time. This version parses the raw position field
// properly (group + side) and compares it against the slot's actual
// group/side instead of doing string-contains checks.

// Groups where left/right actually matters (a specialist right-back
// isn't fully natural at left-back). Center-line groups (DC/DM/MC/AMC)
// use their L/C/R suffix only to place multiple players side by side in
// the grid - there's no genuine "left center-back" training in FM, so
// side is ignored for those.
const WIDE_GROUPS = new Set(['FB', 'WB', 'WM', 'AMW']);

// Which of this project's position groups count as "related" to a slot,
// for the middle familiarity tier.
const RELATED_GROUPS = {
  GK: [], DC: ['DM'], FB: ['WB'], WB: ['FB'], DM: ['DC', 'MC'],
  MC: ['DM', 'AMC'], WM: ['FB', 'AMW'], AMW: ['WM', 'AMC'], AMC: ['MC', 'AMW'], ST: ['AMC'],
};

/** Parses an FM position field ("D/WB/M (L)", "M/AM (RLC)", "DM", "GK")
 * into [{group, side}] tokens, using FM's own group letters (D/WB/DM/M/AM/ST/GK). */
function parsePositionField(field) {
  if (!field) return [];
  const tokens = [];
  field.split(',').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const match = trimmed.match(/^([A-Za-z/]+)(?:\s*\(([RLC]+)\))?$/);
    if (!match) return;
    const groups = match[1].split('/').filter(Boolean);
    const sides = match[2] ? match[2].split('') : [null];
    groups.forEach(group => sides.forEach(side => tokens.push({ group, side })));
  });
  return tokens;
}

/** Maps an FM group+side onto this project's own position-group codes
 * (DC/FB/WB/DM/MC/WM/AMC/AMW/ST/GK). */
function toProjectGroup(fmGroup, side) {
  switch (fmGroup) {
    case 'GK': return 'GK';
    case 'D': return side === 'C' ? 'DC' : 'FB';
    case 'WB': return 'WB';
    case 'DM': return 'DM';
    case 'M': return side === 'C' ? 'MC' : 'WM';
    case 'AM': return side === 'C' ? 'AMC' : 'AMW';
    case 'ST': return 'ST';
    default: return null;
  }
}

/** Slot side ('L'/'R'), only meaningful for the genuinely wide groups. */
function slotSideFor(code, group) {
  if (!WIDE_GROUPS.has(group)) return null;
  if (code.endsWith('L')) return 'L';
  if (code.endsWith('R')) return 'R';
  return null;
}

function calculateFamiliarity(playerPositionStr, targetPositionCode) {
  const slotMeta = POSITION_SLOT_MAP[targetPositionCode] || { group: 'MC' };
  const slotGroup = slotMeta.group;
  const slotSide = slotSideFor(targetPositionCode, slotGroup);

  const tokens = parsePositionField(playerPositionStr);
  if (tokens.length === 0) return { tier: 'foreign', label: 'Out of Position', penalty: 0.60 };

  let best = { tier: 'foreign', label: 'Out of Position', penalty: 0.60 };

  for (const tok of tokens) {
    const projGroup = toProjectGroup(tok.group, tok.side);
    if (!projGroup) continue;

    if (projGroup === slotGroup) {
      const sideOk = !slotSide || !WIDE_GROUPS.has(projGroup) || tok.side === slotSide || tok.side === null;
      if (sideOk) return { tier: 'natural', label: 'Natural', penalty: 1.0 };
      if (best.tier !== 'natural') best = { tier: 'accomplished', label: 'Accomplished', penalty: 0.85 };
      continue;
    }

    if ((RELATED_GROUPS[slotGroup] || []).includes(projGroup) && best.tier === 'foreign') {
      best = { tier: 'unfamiliar', label: 'Unfamiliar', penalty: 0.68 };
    }
  }

  return best;
}

// --- CSV Parsing ---

/** Picks whichever of ; , \t appears most in the header line. FM exports
 * are semicolon-delimited by default (so the decimal commas in columns
 * like Ability/Potential don't clash) - the previous version of this
 * function only ever checked for tab vs comma, so real FM exports
 * (semicolon-delimited) silently parsed as one giant column per row. */
function detectDelimiter(headerLine) {
  const counts = {
    ';': (headerLine.match(/;/g) || []).length,
    ',': (headerLine.match(/,/g) || []).length,
    '\t': (headerLine.match(/\t/g) || []).length,
  };
  let best = ',';
  let bestCount = 0;
  Object.keys(counts).forEach(d => {
    if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
  });
  return best;
}

/** Small state-machine line splitter so a quoted field can safely
 * contain the delimiter character (FM's own exports don't normally
 * quote fields, but this keeps things safe if a value ever does). */
function splitCsvLine(line, delimiter) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseSquadCsv(csvText) {
  const cleaned = String(csvText).replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return { players: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));

  const players = [];

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i], delimiter).map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    if (row.length === 1 && row[0] === '') continue;

    const rawData = {};
    headers.forEach((h, idx) => {
      rawData[h] = row[idx] !== undefined ? row[idx] : '';
    });

    const normalizedRaw = {};
    Object.keys(rawData).forEach(k => {
      normalizedRaw[k.toLowerCase().trim()] = rawData[k];
    });

    if (!rawData['Player']) continue; // skip malformed/blank rows

    const name = rawData['Name'] || rawData['Player'];
    const age = parseInt(rawData['Age'], 10) || null;
    const positionStr = rawData['Position'] || rawData['Positioned'] || '';

    players.push({
      info: { Player: name, Age: age, Position: positionStr },
      raw: rawData,
      normRaw: normalizedRaw
    });
  }

  return { players };
}

// --- Optimal Role Scoring Engine ---

function getAttributeValue(player, attrName) {
  let rawVal = player.raw[attrName] !== undefined ? player.raw[attrName] : player.normRaw[attrName.toLowerCase()];

  if (rawVal === undefined || rawVal === null || rawVal === '') return null;

  let val = parseFloat(rawVal);

  if (isNaN(val) && typeof rawVal === 'string' && rawVal.includes('-')) {
    const parts = rawVal.split('-').map(p => parseFloat(p));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      val = (parts[0] + parts[1]) / 2;
    }
  }

  return isNaN(val) ? null : val;
}

// --- Potential ---
//
// FM exports Ability/Potential as a 0-5 star rating (half-star steps,
// comma as the decimal separator - "4,5" - same as everywhere else in
// these exports). This is a coarse, scouting-knowledge-dependent view of
// overall quality, separate from the specific 1-20 attributes a role
// score is built from - useful for "is this worth developing" in a way
// the attribute-based fit score alone doesn't capture.
function getStarRating(player, columnName) {
  const raw = player.raw[columnName];
  if (raw === undefined || raw === null || raw === '') return null;
  const val = parseFloat(String(raw).replace(',', '.'));
  return isNaN(val) ? null : val;
}

/** Modest multiplier (max +/-8%) so potential can nudge a ranking
 * without overriding actual current ability - only applied when the
 * person has explicitly opted into it via the "Factor in potential"
 * toggle, and only when a Potential rating is actually present (a
 * scouting export that doesn't carry this column, e.g. an unscouted
 * player, is treated as neutral rather than penalised for missing data). */
function potentialMultiplierFor(potential) {
  if (potential === null || potential === undefined) return 1.0;
  return clamp(1 + (potential - 2.5) * 0.032, 0.92, 1.08);
}

// --- Slot scoring ---
//
// A slot's rating is how well a player's attributes suit its in-possession role and its out-of-possession role,
// blended with what the match engine rewards (engineFit20, see RATING_MODELS), less what playing that position costs
// him (positionCost20), scaled by his footedness, his availability and (optionally) potential.
//
// Role fit = the average of the role's KEY attributes. Checked against the game's own star ratings for 20 role
// lists (6 players, every role at every position they can play), the key-attribute average put the roles in the
// game's order 92% of the time, and every attribute beyond the key ones (preferable included) made the match
// worse, so the preferable attributes only count as a small tie-breaker.
const PREF_WEIGHT = 0.05;

/** Role fit on the 0-20 attribute scale, or null when none of the role's key attributes is known. */
function roleFit20(player, role) {
  const v = vecOf(player);
  let ks = 0, kn = 0, ps = 0, pn = 0;
  const ki = role.keyIdx, pi = role.prefIdx;
  for (let i = 0; i < ki.length; i++) { const x = v[ki[i]]; if (x === x) { ks += x; kn++; } }
  if (!kn) return null;
  for (let i = 0; i < pi.length; i++) { const x = v[pi[i]]; if (x === x) { ps += x; pn++; } }
  const km = ks / kn;
  return pn ? (km + PREF_WEIGHT * (ps / pn)) / (1 + PREF_WEIGHT) : km;
}

function cachedStars(player, column) {
  const key = column === 'Potential' ? '_pot' : '_abl';
  if (player[key] === undefined) player[key] = getStarRating(player, column);
  return player[key];
}

/** Full rating of one player for one slot (both roles). */
function calculateSlotScore(player, slot, options) {
  const opts = options || {};
  const strength = opts.hidden === undefined ? HIDDEN_STRENGTH.normal : opts.hidden;
  const ipWeight = opts.ipWeight === undefined ? 0.5 : opts.ipWeight;
  const engineShare = opts.engineShare === undefined ? RATING_MODELS.blend : opts.engineShare;
  const role = slotRole(slot);
  const familiarity = familiarityFor(player, slot.positionCode);
  const potential = cachedStars(player, 'Potential');
  const ability = cachedStars(player, 'Ability');

  const ipFit = roleFit20(player, role.ip);
  const oopFit = roleFit20(player, role.oop);
  if (ipFit === null && oopFit === null) return { score: null, familiarity, potential, ability };

  const roleBase = ipFit === null ? oopFit : (oopFit === null ? ipFit : ipWeight * ipFit + (1 - ipWeight) * oopFit);
  const slotMeta = POSITION_SLOT_MAP[slot.positionCode] || {};
  const engineFit = slotMeta.group === 'GK' ? null : engineFit20(player);
  const base20 = engineFit === null || !engineShare ? roleBase : (1 - engineShare) * roleBase + engineShare * engineFit;
  const foot = footMultiplierFor(player, slotSideFor(slot.positionCode, slotMeta.group), role.ip);
  const hidden = hiddenMultiplier(player, strength);
  const potentialMultiplier = opts.factorPotential ? potentialMultiplierFor(potential) : 1.0;

  const finalScore = (applyPosition(base20, familiarity) / 20) * 100 * foot * hidden * potentialMultiplier;
  return {
    score: Math.round(finalScore * 10) / 10,
    familiarity,
    ipFit: ipFit === null ? null : Math.round((ipFit / 20) * 1000) / 10,
    oopFit: oopFit === null ? null : Math.round((oopFit / 20) * 1000) / 10,
    engineFit: engineFit === null ? null : Math.round((engineFit / 20) * 1000) / 10,
    hiddenMultiplier: hidden,
    potential,
    ability,
  };
}

function rankPlayersForSlot(slot, role, players, options) {
  const ranked = [];
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const result = calculateSlotScore(player, slot, options);
    if (result.score === null) continue;
    ranked.push({
      player, score: result.score, familiarity: result.familiarity, ipFit: result.ipFit, oopFit: result.oopFit,
      engineFit: result.engineFit, hiddenMultiplier: result.hiddenMultiplier, potential: result.potential, ability: result.ability,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

// --- Potential Ceiling Scoring (Potential tab) ---
//
// Distinct from the small +/-8% "Factor in potential" nudge available on
// the Tactical Fit / Squad Depth scores above - this produces a
// standalone 0-100 "how good could this player become in this exact
// slot" estimate. It uses every development-relevant column the import
// happens to carry: the scouted Potential star rating (their overall
// ceiling), Age (how much room is left to grow into it), and whichever
// growth/personality hidden attributes the view included (Determination,
// Ambition, Professionalism, Adaptability, Consistency, Important
// Matches, Versatility, Injury Proneness). Anything missing is simply
// left out rather than guessed at or treated as a hard requirement.
const GROWTH_ATTRS = ['Determination', 'Ambition', 'Professionalism', 'Adaptability', 'Consistency', 'Important Matches', 'Versatility'];
const INJURY_ATTR = 'Injury Proneness';

/** 0 (no realistic headroom left) - 1 (maximum years of development
 * ahead) based on age. FM players are broadly "grown" by their late 20s -
 * a 16 year old has the most room to move from current ability toward
 * their ceiling, a 30+ year old has essentially none left. */
function ageHeadroom(age) {
  if (age === null || age === undefined) return 0.5; // unknown age - stay neutral rather than assume either extreme
  if (age <= 16) return 1.0;
  if (age >= 30) return 0.05;
  return clamp((30 - age) / (30 - 16), 0.05, 1.0);
}

/** Average (0-1) of whichever growth-relevant hidden attributes are
 * present in the import, plus how many of them were actually found and
 * an injury-risk multiplier. A player whose export doesn't include any
 * of these columns gets a neutral 0.5 factor rather than being penalised
 * for a view that didn't carry them. */
function growthProfile(player) {
  let sum = 0, count = 0;
  GROWTH_ATTRS.forEach(name => {
    const val = getAttributeValue(player, name);
    if (val !== null) { sum += val / 20; count++; }
  });
  const factor = count > 0 ? sum / count : 0.5;

  // FM's Injury Proneness runs 1 (never injured) - 20 (very injury
  // prone); frequent injuries eat into the seasons a player has to
  // actually develop, so it trims the ceiling slightly rather than
  // being averaged in as a normal growth attribute.
  const injury = getAttributeValue(player, INJURY_ATTR);
  const injuryMultiplier = injury !== null ? clamp(1 - ((injury - 1) / 19) * 0.15, 0.85, 1.0) : 1.0;

  return { factor, dataCount: count, injuryMultiplier };
}

/** Potential ceiling on a 0-100 scale: the game's real Potential Ability
 * (0-200, supplied as "PA" when the data comes straight from FM's memory)
 * when present, otherwise the coarse 0-5 star Potential rating from a CSV
 * export. null when neither is available. */
function potentialCeiling100(player, stars) {
  const pa = getAttributeValue(player, 'PA');
  if (pa !== null && pa > 0) return clamp(pa / 2, 0, 100);
  if (stars !== null && stars !== undefined) return (stars / 5) * 100;
  return null;
}

/** Standalone 0-100 "how good could this player become in this slot" score, separate from the current-ability
 * Tactical Fit score. Blends the player's own Potential (his PA ceiling) with his current fit for the slot,
 * weighted by how much development room his age leaves and how his growth attributes suggest he'll use it. A
 * player with no Potential figure at all still gets an estimate, projected from age + growth attributes +
 * current fit rather than left blank. */
function calculatePotentialScore(player, slot, options) {
  const fitResult = calculateSlotScore(player, slot, Object.assign({}, options, { factorPotential: false }));
  if (fitResult.score === null) {
    return { score: null, familiarity: fitResult.familiarity, potential: fitResult.potential };
  }

  const age = player.info.Age;
  const headroom = ageHeadroom(age);
  const growth = growthProfile(player);
  const familiarity = fitResult.familiarity;
  const currentFit = fitResult.score;

  const ceilingValue = potentialCeiling100(player, fitResult.potential);

  let blended;
  if (ceilingValue !== null) {
    // Potential Ability describes the player overall, not this specific slot - so the ceiling is discounted by
    // positional familiarity just like the current fit already is.
    const ceiling = ceilingValue * familiarity.penalty;
    // How much of the gap between current fit and ceiling this player realistically closes - young +
    // determined/professional/adaptable players close most of it, old or low-application players barely move.
    const growthWeight = headroom * (0.5 + growth.factor * 0.5);
    // Growth only ever adds: a player whose attribute fit already exceeds the PA-derived ceiling hasn't
    // "regressed", the two scales just differ.
    blended = currentFit + Math.max(0, ceiling - currentFit) * growthWeight;
  } else {
    const projectedBoost = headroom * growth.factor * 15;
    blended = currentFit + projectedBoost;
  }

  blended *= growth.injuryMultiplier;

  return {
    score: Math.round(clamp(blended, 0, 100) * 10) / 10,
    currentFit: Math.round(currentFit * 10) / 10,
    ceiling: ceilingValue !== null ? Math.round(ceilingValue * 10) / 10 : null,
    familiarity,
    potential: fitResult.potential,
    ageHeadroom: Math.round(headroom * 100),
    growthDataCount: growth.dataCount,
  };
}

function rankPlayersForPotential(slot, role, players, options) {
  const ranked = [];
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const result = calculatePotentialScore(player, slot, options);
    if (result.score === null) continue;
    ranked.push({
      player, score: result.score, currentFit: result.currentFit, ceiling: result.ceiling,
      familiarity: result.familiarity, potential: result.potential,
      ageHeadroom: result.ageHeadroom, growthDataCount: result.growthDataCount,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

// --- Globally Optimized Lineup Selection ---

/** Best-value assignment of players to slots (Hungarian algorithm): the XI whose ratings add up highest, with
 * nobody in two places. `slotsWithRankings` = [{ slot, role, ranked: [{ player, score, ... }] }]; returns, per
 * slot, the chosen ranked entry or null when no eligible player is left for it. (An earlier version filled the
 * slots one by one, which let the first slot take a player who was worth more somewhere else.) */
function greedyBestXI(slotsWithRankings) {
  const n = slotsWithRankings.length;
  const index = new Map();
  slotsWithRankings.forEach(sr => sr.ranked.forEach(r => {
    const id = playerId(r.player);
    if (!index.has(id)) index.set(id, index.size);
  }));
  const m = index.size;
  if (n === 0 || m === 0) return slotsWithRankings.map(() => null);

  // rows = slots, columns = players, then one "empty" column per slot (cost 0) so a slot can stay unfilled
  const cols = m + n;
  const BIG = 1e6;
  const cost = [];
  const cell = [];
  for (let i = 0; i < n; i++) {
    const row = new Float64Array(cols).fill(BIG);
    for (let k = 0; k < n; k++) row[m + k] = 0;
    cost.push(row);
    cell.push(new Array(m).fill(null));
  }
  slotsWithRankings.forEach((sr, i) => sr.ranked.forEach(r => {
    const j = index.get(playerId(r.player));
    cost[i][j] = -r.score;
    cell[i][j] = r;
  }));

  const INF = 1e18;
  const u = new Float64Array(n + 1), v = new Float64Array(cols + 1);
  const p = new Int32Array(cols + 1), way = new Int32Array(cols + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(cols + 1).fill(INF);
    const used = new Uint8Array(cols + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const assignment = new Array(n).fill(null);
  for (let j = 1; j <= m; j++) {
    if (p[j]) assignment[p[j] - 1] = cell[p[j] - 1][j - 1];
  }
  return assignment;
}

// --- Squad Depth Engine ---

function computeSquadDepth(slotsWithRankings) {
  const depthCount = 3;
  const numSlots = slotsWithRankings.length;
  if (numSlots === 0) {
    return { depthSlots: [], overallAvgScore: 0, totalAssigned: 0, strongestPos: null, weakestPos: null };
  }

  const assignedPlayerIds = new Set();
  const slotAssignments = Array.from({ length: numSlots }, () => []);

  for (let depthIdx = 0; depthIdx < depthCount; depthIdx++) {
    const filteredSlots = slotsWithRankings.map((sr) => {
      const remainingRanked = sr.ranked.filter(r => {
        const pId = r.player.info.Player + '|' + (r.player.raw['Unique ID'] || '');
        return !assignedPlayerIds.has(pId);
      });
      return {
        slot: sr.slot,
        role: sr.role,
        ranked: remainingRanked
      };
    });

    const assignment = greedyBestXI(filteredSlots);

    assignment.forEach((r, slotIdx) => {
      if (r) {
        const pId = r.player.info.Player + '|' + (r.player.raw['Unique ID'] || '');
        assignedPlayerIds.add(pId);
        slotAssignments[slotIdx].push(r);
      }
    });
  }

  let totalScoreSum = 0;
  let totalAssignedCount = 0;

  const depthSlots = slotsWithRankings.map((sr, slotIdx) => {
    const assignedPlayers = slotAssignments[slotIdx];
    let posScoreSum = 0;
    assignedPlayers.forEach(r => {
      posScoreSum += r.score;
      totalScoreSum += r.score;
      totalAssignedCount++;
    });

    const avgScore = assignedPlayers.length > 0
      ? Math.round((posScoreSum / assignedPlayers.length) * 10) / 10
      : 0;

    return {
      slot: sr.slot,
      role: sr.role,
      players: assignedPlayers,
      avgScore
    };
  });

  const overallAvgScore = totalAssignedCount > 0
    ? Math.round((totalScoreSum / totalAssignedCount) * 10) / 10
    : 0;

  let strongestPos = null;
  let weakestPos = null;
  if (depthSlots.length > 0) {
    const sorted = [...depthSlots].sort((a, b) => b.avgScore - a.avgScore);
    strongestPos = sorted[0];
    weakestPos = sorted[sorted.length - 1];
  }

  return {
    depthSlots,
    overallAvgScore,
    totalAssigned: totalAssignedCount,
    strongestPos,
    weakestPos
  };
}

function playerId(player) {
  return player.info.Player + '|' + (player.raw['Unique ID'] || '');
}

// --- Player Overview (Player Search tab) ---
//
// Groups every attribute this project knows about into the categories FM
// itself uses, so the search overview can show "whatever's in the
// import" without hard-coding a specific export's column set. Determination
// is a normal visible Mental attribute in FM - the genuinely hidden
// personality/development attributes get their own category since they
// usually require a dedicated column in the export view to see at all.
const ATTRIBUTE_CATEGORIES = {
  Technical: ['Corners', 'Crossing', 'Dribbling', 'Finishing', 'First Touch', 'Free Kick Taking', 'Heading', 'Long Shots', 'Long Throws', 'Marking', 'Passing', 'Penalty Taking', 'Tackling', 'Technique'],
  Mental: ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'Off The Ball', 'Positioning', 'Team Work', 'Vision', 'Work Rate'],
  Physical: ['Acceleration', 'Agility', 'Balance', 'Jumping Reach', 'Natural Fitness', 'Pace', 'Stamina', 'Strength'],
  Goalkeeping: ['Aerial Reach', 'Command Of Area', 'Communication', 'Eccentricity', 'Handling', 'Kicking', 'One On Ones', 'Reflexes', 'Rushing Out (Tendency)', 'Punching', 'Throwing'],
  'Hidden / Personality': ['Adaptability', 'Ambition', 'Consistency', 'Controversy', 'Dirtiness', 'Important Matches', 'Injury Proneness', 'Loyalty', 'Professionalism', 'Pressure', 'Sportsmanship', 'Temperament', 'Versatility'],
};

// One representative slot code per position group, used to survey a player across every position on the pitch
// rather than just the slots currently on the tactic grid. Wide groups list both sides and the better-scoring
// one wins, so a player's stronger foot naturally picks their best side.
const POSITION_OVERVIEW_GROUPS = [
  { group: 'GK', label: 'Goalkeeper', codes: ['GK'] },
  { group: 'DC', label: 'Centre Back', codes: ['DC'] },
  { group: 'FB', label: 'Full Back', codes: ['DL', 'DR'] },
  { group: 'WB', label: 'Wing Back', codes: ['WBL', 'WBR'] },
  { group: 'DM', label: 'Defensive Mid', codes: ['DMC'] },
  { group: 'MC', label: 'Central Mid', codes: ['MC'] },
  { group: 'WM', label: 'Wide Mid', codes: ['ML', 'MR'] },
  { group: 'AMC', label: 'Attacking Mid', codes: ['AMC'] },
  { group: 'AMW', label: 'Winger', codes: ['AML', 'AMR'] },
  { group: 'ST', label: 'Striker', codes: ['STC'] },
];

/** For one player, his best in-possession and out-of-possession role in every position group on the pitch (not
 * just the slots in the current tactic) and the potential for that pairing. The two phases add up linearly, so
 * the best pair is simply the best role of each phase. */
function computePlayerPositionOverview(player, options) {
  const best_ = (code, phase) => {
    let top = null;
    GET_ROLES_FOR_POSITION(code, phase).forEach(role => {
      const f = roleFit20(player, role);
      if (f !== null && (!top || f > top.f)) top = { role, f };
    });
    return top;
  };
  return POSITION_OVERVIEW_GROUPS.map(g => {
    let best = null;
    g.codes.forEach(code => {
      const ip = best_(code, 'ip');
      const oop = best_(code, 'oop');
      if (!ip && !oop) return;
      const d = defaultRoleIds(code);
      const slot = { positionCode: code, ipRoleId: ip ? ip.role.id : d.ipRoleId, oopRoleId: oop ? oop.role.id : d.oopRoleId };
      const result = calculateSlotScore(player, slot, options);
      if (result.score !== null && (!best || result.score > best.score)) {
        best = { code, slot, role: slotRole(slot), score: result.score, familiarity: result.familiarity, ipFit: result.ipFit, oopFit: result.oopFit };
      }
    });

    if (!best) {
      return { group: g.group, label: g.label, code: null, role: null, score: null, familiarity: null, potentialScore: null };
    }
    const potentialResult = calculatePotentialScore(player, best.slot, options);
    return {
      group: g.group, label: g.label, code: best.code, role: best.role, slot: best.slot,
      score: best.score, familiarity: best.familiarity, ipFit: best.ipFit, oopFit: best.oopFit,
      potentialScore: potentialResult.score,
    };
  }).sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
}

// --- Formations: presets, role suggestions and comparison ---

const PRESET_FORMATIONS = [
  { name: '4-2-3-1', codes: ['GK', 'DL', 'DCL', 'DCR', 'DR', 'DMCL', 'DMCR', 'AML', 'AMC', 'AMR', 'STC'] },
  { name: '4-3-3', codes: ['GK', 'DL', 'DCL', 'DCR', 'DR', 'DMC', 'MCL', 'MCR', 'AML', 'AMR', 'STC'] },
  { name: '4-4-2', codes: ['GK', 'DL', 'DCL', 'DCR', 'DR', 'ML', 'MCL', 'MCR', 'MR', 'STCL', 'STCR'] },
  { name: '4-1-4-1', codes: ['GK', 'DL', 'DCL', 'DCR', 'DR', 'DMC', 'ML', 'MCL', 'MCR', 'MR', 'STC'] },
  { name: '4-3-2-1', codes: ['GK', 'DL', 'DCL', 'DCR', 'DR', 'MCL', 'MC', 'MCR', 'AMCL', 'AMCR', 'STC'] },
  { name: '3-5-2', codes: ['GK', 'DCL', 'DC', 'DCR', 'WBL', 'DMC', 'MCL', 'MCR', 'WBR', 'STCL', 'STCR'] },
  { name: '3-4-3', codes: ['GK', 'DCL', 'DC', 'DCR', 'WBL', 'MCL', 'MCR', 'WBR', 'AML', 'STC', 'AMR'] },
  { name: '5-3-2', codes: ['GK', 'WBL', 'DCL', 'DC', 'DCR', 'WBR', 'MCL', 'MC', 'MCR', 'STCL', 'STCR'] },
];

/** The in-possession and out-of-possession role at a position that suit the squad's best few players for it. */
function suggestRoles(positionCode, players, options, depth) {
  const n = depth || 3;
  const pick = (phase) => {
    let bestRole = null, bestVal = -1;
    GET_ROLES_FOR_POSITION(positionCode, phase).forEach(role => {
      const vals = [];
      players.forEach(p => {
        const f = roleFit20(p, role);
        if (f !== null) vals.push(applyPosition(f, familiarityFor(p, positionCode)));
      });
      vals.sort((a, b) => b - a);
      const top = vals.slice(0, n);
      if (!top.length) return;
      const val = top.reduce((a, b) => a + b, 0) / top.length;
      if (val > bestVal) { bestVal = val; bestRole = role; }
    });
    return bestRole;
  };
  const d = defaultRoleIds(positionCode);
  const ip = pick('ip');
  const oop = pick('oop');
  return { positionCode, ipRoleId: ip ? ip.id : d.ipRoleId, oopRoleId: oop ? oop.id : d.oopRoleId };
}

/** Best XI a squad can field in a formation (slots = [{positionCode, ipRoleId, oopRoleId}]). */
function evaluateFormation(slots, players, options) {
  const rankedSlots = slots.map(slot => ({ slot, role: slotRole(slot), ranked: rankPlayersForSlot(slot, null, players, options) }));
  const assignment = greedyBestXI(rankedSlots);
  let total = 0, filled = 0, weakest = null;
  assignment.forEach((r, i) => {
    if (!r) return;
    total += r.score;
    filled++;
    if (!weakest || r.score < weakest.score) weakest = { score: r.score, slot: slots[i], player: r.player };
  });
  return {
    rankedSlots, assignment, filled, weakest,
    total: Math.round(total * 10) / 10,
    avg: filled ? Math.round((total / filled) * 10) / 10 : 0,
  };
}

/** The bench: players outside the XI who cover the most ground. Each remaining player is measured at every slot
 * as a fraction of the starter there (capped at 100%); the bench is built greedily, always taking the player who
 * adds the most cover where nobody on the bench covers yet - so the reserve keeper goes in first, then one
 * cover per area before a second one. */
function computeBench(rankedSlots, assignment, size) {
  const n = rankedSlots.length;
  const used = new Set(assignment.filter(Boolean).map(r => playerId(r.player)));
  const cands = new Map();
  rankedSlots.forEach((rs, i) => {
    const starter = assignment[i];
    const base = starter ? starter.score : (rs.ranked[0] ? rs.ranked[0].score : 1);
    rs.ranked.forEach(r => {
      const id = playerId(r.player);
      if (used.has(id)) return;
      let c = cands.get(id);
      if (!c) { c = { player: r.player, q: new Array(n).fill(0), r: new Array(n).fill(null) }; cands.set(id, c); }
      c.q[i] = Math.min(1, r.score / Math.max(base, 1));
      c.r[i] = r;
    });
  });
  const covered = new Array(n).fill(0);
  const picks = [];
  while (picks.length < (size || 9) && cands.size) {
    let best = null, bestGain = -1, bestId = null;
    cands.forEach((c, id) => {
      let gain = 0, top = 0;
      c.q.forEach((q, i) => { if (q > covered[i]) gain += q - covered[i]; if (q > top) top = q; });
      gain += top * 0.01;                                   // ties go to the better all-round player
      if (gain > bestGain) { best = c; bestGain = gain; bestId = id; }
    });
    if (!best || bestGain <= 0) break;
    cands.delete(bestId);
    let bi = 0;
    best.q.forEach((q, i) => { if (q > best.q[bi]) bi = i; if (q > covered[i]) covered[i] = q; });
    picks.push({ player: best.player, slot: rankedSlots[bi].slot, role: rankedSlots[bi].role, entry: best.r[bi], cover: best.q[bi] });
  }
  return picks;
}

// --- Financial / Sell List (Financial tab) ---
//
// FM's transfer value column is free text ("£1.5M", "£1.5M - £2.75M",
// "Not for Sale", "Unknown") rather than a plain number - this parses
// whatever form it comes in into a comparable number for sorting, while
// keeping the original string around for display since guessing a
// currency symbol back onto a bare number would just be wrong for saves
// using a different currency.
function parseSingleMoney(str) {
  const match = String(str).match(/([\d,.]+)\s*(K|M|B)?/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(num)) return null;
  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') return num * 1e3;
  if (suffix === 'M') return num * 1e6;
  if (suffix === 'B') return num * 1e9;
  return num;
}

function parseMoneyValue(raw) {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str || /not for sale/i.test(str) || /unknown/i.test(str) || str === '-') return null;

  // A "£1.5M - £2.75M" range: average both ends into a single comparable figure.
  const parts = str.split('-').map(p => p.trim()).filter(Boolean);
  const nums = parts.map(parseSingleMoney).filter(n => n !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Same lookup fallback as getAttributeValue, but for free-text fields
 * (money, etc.) that shouldn't be run through parseFloat. */
function getRawField(player, names) {
  for (const name of names) {
    const v = player.raw[name] !== undefined ? player.raw[name] : player.normRaw[name.toLowerCase()];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/** Surplus-value candidates: every squad player who isn't the 1st or 2nd
 * choice (starter or backup) for any active tactic slot, per the same
 * Squad Depth assignment shown on that tab - i.e. genuinely spare bodies,
 * not just anyone ranked outside the top 3. Sorted by transfer value
 * (highest first; players with no parseable value sort last rather than
 * being dropped, since "no data" isn't the same as "worthless"). Also
 * carries each candidate's single best role/score among the active
 * slots, for context on why they didn't make the cut. */
function computeSellCandidates(rankedSlots, squadPlayers) {
  const depthData = rankedSlots.length > 0 && typeof computeSquadDepth === 'function'
    ? computeSquadDepth(rankedSlots)
    : { depthSlots: [] };

  const protectedIds = new Set();
  depthData.depthSlots.forEach(ds => {
    [ds.players[0], ds.players[1]].forEach(r => {
      if (r) protectedIds.add(playerId(r.player));
    });
  });

  const bestFitByPlayer = new Map();
  rankedSlots.forEach(rs => {
    rs.ranked.forEach(r => {
      const pid = playerId(r.player);
      const current = bestFitByPlayer.get(pid);
      if (!current || r.score > current.score) {
        bestFitByPlayer.set(pid, { score: r.score, role: rs.role, positionCode: rs.slot.positionCode, familiarity: r.familiarity });
      }
    });
  });

  const candidates = squadPlayers
    // Players on loan *to* us belong to another club, so they're never ours to sell.
    .filter(p => !protectedIds.has(playerId(p)) && !getRawField(p, ['On Loan From']))
    .map(p => {
      const valueRaw = getRawField(p, ['Transfer Value', 'Value']);
      return {
        player: p,
        valueRaw,
        valueNum: parseMoneyValue(valueRaw),
        bestFit: bestFitByPlayer.get(playerId(p)) || null,
      };
    });

  candidates.sort((a, b) => {
    if (a.valueNum === null && b.valueNum === null) return 0;
    if (a.valueNum === null) return 1;
    if (b.valueNum === null) return -1;
    return b.valueNum - a.valueNum;
  });

  return candidates;
}