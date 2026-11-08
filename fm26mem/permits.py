"""Who can play for a club without a work permit - a nationality-based guide.

The game decides a real work permit with a points system (international caps, the strength
of the league the player comes from, ...). That is not stored on the player, so this takes
the simple first test the rules start from: does the player hold a passport that gets free
movement into the club's country? His own nationality and his secondary nationalities both
count (a dual national is free, exactly as in the game's "Secondary Nationalities" field).

  club in the UK        -> UK nations + Ireland (Common Travel Area)
  club in Ireland       -> EU/EEA/Switzerland + the UK nations
  club in the EU/EEA/CH -> EU/EEA/Switzerland
  anywhere else         -> only the club's own nation

Names are the game's own nation names.
"""

UK_NATIONS = frozenset({'England', 'Scotland', 'Wales', 'Northern Ireland'})
COMMON_TRAVEL_AREA = UK_NATIONS | {'Ireland'}
EU = frozenset({
    'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland',
    'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg',
    'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden'})
EEA_AND_SWITZERLAND = frozenset({'Iceland', 'Liechtenstein', 'Norway', 'Switzerland'})
EUROPEAN_FREE_MOVEMENT = EU | EEA_AND_SWITZERLAND


def free_nations(club_nation):
    """Nationalities that can work for a club in `club_nation` without a permit."""
    if not club_nation:
        return frozenset()
    if club_nation in UK_NATIONS:
        return COMMON_TRAVEL_AREA
    if club_nation == 'Ireland':
        return EUROPEAN_FREE_MOVEMENT | UK_NATIONS
    if club_nation in EUROPEAN_FREE_MOVEMENT:
        return EUROPEAN_FREE_MOVEMENT
    return frozenset({club_nation})


def describe(club_nation):
    """One line for the UI: what 'free' means for this club."""
    if not club_nation:
        return ''
    if club_nation in UK_NATIONS:
        return 'club in %s: only UK and Irish passports are free' % club_nation
    if club_nation == 'Ireland' or club_nation in EUROPEAN_FREE_MOVEMENT:
        return 'club in %s: EU/EEA/Swiss passports are free' % club_nation
    return 'club in %s: only %s nationals are free' % (club_nation, club_nation)
