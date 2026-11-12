"""Memory layout of a Football Manager player record (reverse-engineered from the live process).

A player record is a fixed 968-byte struct stored in 1024-slot pages, sorted by ID.
Offsets below are relative to the start of the record, which begins 0x140 bytes
*before* the person-object vtable that the ID lives behind.

FM26 and FM27 use the identical layout (FM27 checked field-by-field against the game's own
player screens). If a future game update changes the engine, this is the one file that needs
re-calibrating; `FM26Reader` runs sanity checks against these offsets and refuses to return
nonsense.
"""

RECORD_SIZE = 968
STRIDE_QWORDS = RECORD_SIZE // 8          # 121
PRE = 0x140                               # record start -> person vtable

# --- fixed-offset fields (record-relative) -------------------------------------
OFF_PLAYER_VTABLE = 0x000
OFF_RATINGS = 0x008                       # 15 x u8, position familiarity 1..20
OFF_ATTRS = 0x017                         # 54 x u8, attributes 1..100 (displayed = round(raw / 5))
OFF_FLAGS = 0x0A6                         # u16 bit flags (0x10 = was at the human manager's club; sticky)
OFF_DATE_STAMP = 0x0B8                    # u16 day-of-year, u16 year (game date for actively simulated players)
OFF_HEIGHT = 0x0E6                        # u8 cm
OFF_VALUE = 0x0EC                         # u32 transfer value, base currency
OFF_SHARPNESS = 0x110                     # u16 match sharpness today, 0..10000 (= 0-100%), see below
OFF_CONDITION = 0x114                     # u16 condition (physical fitness) today, 0..10000
FITNESS_MAX = 10000
OFF_REP = 0x116                         # 3 x u16: home, current, world reputation (0..10000)
OFF_CA = 0x11C                            # u16 current ability 0..200
OFF_PA = 0x11E                            # u16 potential ability 0..200
OFF_PERSON_VTABLE = 0x140
OFF_TAG = 0x148                           # u32 index into the global person table (0xFFFFFFFF = unused slot)
TAG_UNUSED = 0xFFFFFFFF
OFF_ID = 0x14C                            # u32 player ID; wiped to 0xFFFFFFFF when the player retires
OFF_ID_COPY = 0x150                       # u32 person ID (survives retirement, e.g. as a coach)
ID_NONE = 0xFFFFFFFF
OFF_NAME_FIRST = 0x190                    # u64 ptr -> name entry -> ptr -> [u32 len][utf-8]
OFF_NAME_LAST = 0x198
OFF_NAME_COMMON = 0x1A0
OFF_NATION = 0x1A8                        # u64 ptr -> nation object (+8 id, +0x18 -> name)
OFF_PERSONALITY = 0x1B0                   # 8 x u8, 1..20
OFF_RELATIONS = 0x1B8                     # u64 ptr -> [begin, end) vector of 16-byte relation entries (see REL_*)
OFF_DOB = 0x1C8                           # u16 day-of-year, u16 year
OFF_CONTRACT = 0x1E8                      # u64 ptr -> contract object; null when the player has no club
OFF_LOAN = 0x1F0                          # u64 ptr -> loan slot; slot+0x00 -> loan agreement (null when not on loan)
OFF_PREV_CLUB = 0x248                     # u64 ptr -> club object

# The club a player belongs to / plays for is found through the same two-hop chain for
# both the contract and the loan agreement:  object -> +0x10 holder -> +0x30 club.
#   contract club = who owns his registration (the parent club for a loan)
#   loan club     = where he is playing right now; only exists while a loan is running
#   current club  = loan club if there is one, else contract club (no contract = free agent)
OWNER_PTR = 0x08                          # contract / loan agreement -> the person object that owns it
HOLDER_PTR = 0x10                         # contract / loan agreement -> holder object
HOLDER_CLUB = 0x30                        # holder object -> club object
LOAN_SLOT_AGREEMENT = 0x00                # loan slot -> loan agreement object
CONTRACT_WAGE = 0x20
CONTRACT_EXPIRY = 0x48
CLUB_ID = 0x08
CLUB_NATION = 0xD8                        # club -> nation of the football association it plays under (+0xE8 = where it is)
CLUB_REPUTATION = 0x168                   # u16, 0..10000 (Fulham 7150, Real Madrid 9750) - but 0 for ~half the clubs (Bayern, Ajax...)
CLUB_NAME_FULL = 0xC0
CLUB_NAME_SHORT = 0xC8
NATION_ID = 0x08
NATION_NAME = 0x20                        # short common name ("Ivory Coast"); +0x18 is the official one

# Condition and match sharpness (OFF_CONDITION, OFF_SHARPNESS) move every day: training and rest change them, a match
# drains condition and builds sharpness. 0..10000 is the scale Fm-Match-Lab writes into FM27's match engine
# (condition=8000 is 80%). FM27 itself never shows either as a number - only the heart / sharpness icons in the squad
# views and the heart's band in its tooltip - so they were matched against those, for all 75 squad players of the KäPa
# save on 11/04/2027 (a match day; the U18s had played the day before):
#   condition (the heart's tooltip): Ben Arfi 7379 "Fair"; Mäntylä 7844, Larsson 7901, Mattsson 7988, Åhman 8059,
#     Ferrer 8308 ("Good, Tired"), Pöyry 8427, A. Lähteenmäki 8537 "Good"; Kuusinen 8718 "Excellent", and everyone at
#     8729 or more shows the full green heart.
#   sharpness (the icon): Collin 4054 an orange arrow down; 31 players at 5300-5950 the yellow dash ("Lacking
#     Sharpness"); Puro 6334, Kolehmainen 6386, Salmi 6712, Taipale 7206 one arrow up; P. Lähteenmäki 7465, Ahola 7635,
#     Pakarinen 8300 two arrows up; 8525 and above the green tick (the starters who had played a week before: 10000).
# Across the database both stay within 0..10000. The i16 at +0x112, between the two, rises for players who are gaining
# sharpness and falls for the rest; it isn't used.

# Sticky "has been at the human club" bit. It is never cleared when a player leaves (or when a
# youth-intake prospect is turned down), so it is only used to work out *which* club is the human's.
FLAG_HUMAN_CLUB = 0x10

# --- the human club's first-team injury list (what the Medical Centre's "Current Injuries" shows) --
# The club's medical department object owns two vectors of entries: injuries going on now (0x50-byte
# entries) and ones that ended recently (0x58-byte entries, +0x40 reads 0xFFFFFFFF). An entry starts with
# the player's person object and the injury-type object (type +0x20 -> [u32 len][utf-8] "a double hernia"),
# has a fixed marker pair further down and points back at the department. Only the first team's list is
# read: U21/U18 injuries and other clubs' injuries are kept in other places.
INJ_ENTRY_PERSON = 0x00
INJ_ENTRY_TYPE = 0x08
INJ_ENTRY_MARKER = 0x28                   # u64 0xFFFFFFFF076C0001 (an empty date), then 0x4FFFF at +0x30
INJ_ENTRY_MARKER_VALUE = 0xFFFFFFFF076C0001
INJ_ENTRY_MARKER2_VALUE = 0x4FFFF
INJ_ENTRY_STATE = 0x40                    # u32: min/max days left; 0xFFFFFFFF once the injury is over
INJ_ENTRY_OWNER = 0x48
INJ_ENTRY_SIZE = 0x50
INJ_TYPE_NAME = 0x20
# Injuries from roughly the last week are not in that list yet: each is a separate 0x78-byte object whose
# injury type is repeated at +0x50, with the start date at +0x18 (low 9 bits day of year, high word the
# year, then 0xFFFFFFFF), the planned length in days as a u16 at +0x20 and the injured player at +0x68.
# (A completed injury leaves its object behind, so "current" means start <= today < start + length.)
INJ_CASE_TYPE_AGAIN = 0x50
INJ_CASE_DATE = 0x18
INJ_CASE_DAYS = 0x20
INJ_CASE_PERSON = 0x68

# --- relation list (record + OFF_RELATIONS) ------------------------------------------------------------
# Each player has a vector of 16-byte entries tying him to nations, clubs and people:
#   +0x00 u64 pointer to the nation / club / person,  +0x0A, +0x0B two type bytes,  +0x0C a value byte.
# Checked against the game's Personal -> Eligibility screen (Kuningas, Ekangamene, Darwich, 26/12/2026):
# every row there is one of these entries, in the same order.
REL_ENTRY_SIZE = 16
REL_PTR = 0x00
REL_TYPE = (0x0A, 0x0B)
REL_VALUE = 0x0C
REL_SECONDARY_NATIONALITY = (0x08, 0x09)  # -> a nation: "Secondary Nationalities" on the Personal screen
REL_HOME_GROWN_NATION = (0x08, 0x46)      # -> a nation: a "Nation Eligibility" row ("Nation Trained In")
REL_HOME_GROWN_CLUB = (0x01, 0x48)        # -> a club: a "Club Eligibility" row ("Club Trained In")
# The value byte of a home-grown entry is its eligibility type. A player gets one entry per type he meets,
# and only the strongest of the two common ones: 15-21 (which covers 0-21 too) or 0-21 alone.
HG_15_21 = 1                              # "Homegrown 15-21"
HG_0_21 = 2                               # "Homegrown 0-21"
# Other values belong to particular countries' rules; their label depends on the nation (3 reads "Homegrown
# 0-23 or Belgian" for Belgium but "Homegrown 15-21" for Lebanon, 10 is England's "Homegrown 0-19 (1 year)")
# and they are not used.

# --- the 54 attribute bytes, in memory order ------------------------------------
LEFT_FOOT = '_LeftFoot'
RIGHT_FOOT = '_RightFoot'
ATTR_ORDER = [
    'Crossing', 'Dribbling', 'Finishing', 'Heading', 'Long Shots', 'Marking', 'Off The Ball',
    'Passing', 'Penalty Taking', 'Tackling', 'Vision',
    'Handling', 'Aerial Reach', 'Command Of Area', 'Communication', 'Kicking', 'Throwing',
    'Anticipation', 'Decisions', 'One On Ones', 'Positioning', 'Reflexes', 'First Touch', 'Technique',
    LEFT_FOOT, RIGHT_FOOT,
    'Flair', 'Corners', 'Team Work', 'Work Rate', 'Long Throws', 'Eccentricity',
    'Rushing Out (Tendency)', 'Punching', 'Acceleration', 'Free Kick Taking', 'Strength', 'Stamina',
    'Pace', 'Jumping Reach', 'Leadership',
    'Dirtiness', 'Balance', 'Bravery', 'Consistency', 'Aggression', 'Agility', 'Important Matches',
    'Injury Proneness', 'Versatility', 'Natural Fitness', 'Determination', 'Composure', 'Concentration',
]
assert len(ATTR_ORDER) == 54

# 8 hidden personality attributes, 1..20. Ambition / Loyalty / Professionalism / Controversy are
# pinned down by the in-game personality labels (Unambitious, Fairly Loyal, Perfectionist, ...);
# Adaptability / Pressure / Sportsmanship / Temperament are the best fit for the remaining slots.
PERSONALITY_ORDER = ['Adaptability', 'Ambition', 'Loyalty', 'Pressure',
                     'Professionalism', 'Sportsmanship', 'Temperament', 'Controversy']

# 15 position-familiarity bytes
POSITION_CODES = ['GK', 'SW', 'DL', 'DC', 'DR', 'DM', 'ML', 'MC', 'MR',
                  'AML', 'AMC', 'AMR', 'STC', 'WBL', 'WBR']
POSITION_LISTED_AT = 15                   # a position appears in the FM position string at >= 15

# bands for the 1..100 foot values
FOOT_BANDS = [(96, 'Very Strong'), (73, 'Strong'), (58, 'Fairly Strong'),
              (43, 'Reasonable'), (21, 'Weak'), (0, 'Very Weak')]
