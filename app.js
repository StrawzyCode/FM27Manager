(function () {
  'use strict';

  // --- Pitch Grid Matrix Layout ---
  const PITCH_MATRIX = [
    [null, 'STCL', 'STC', 'STCR', null],
    ['AML', 'AMCL', 'AMC', 'AMCR', 'AMR'],
    ['ML', 'MCL', 'MC', 'MCR', 'MR'],
    ['WBL', 'DMCL', 'DMC', 'DMCR', 'WBR'],
    ['DL', 'DCL', 'DC', 'DCR', 'DR'],
    [null, null, 'GK', null, null]
  ];

  // Display order for anything that lists pitch positions: goalkeeper first, then back to front
  // (defenders, wing-backs / defensive mids, midfield, attacking mids, strikers) and left to right
  // along each line - the order they sit on the pitch, not the order they were clicked in.
  // (Who gets *picked* for which slot still follows the order slots were added; only the
  // display is reordered, so the suggestions themselves never change.)
  const PITCH_ORDER = {};
  PITCH_MATRIX.forEach((row, r) => row.forEach((code, c) => {
    if (code) PITCH_ORDER[code] = (PITCH_MATRIX.length - 1 - r) * 10 + c;
  }));
  function inPitchOrder(items, codeOf) {
    return items.slice().sort((a, b) => (PITCH_ORDER[codeOf(a)] ?? 99) - (PITCH_ORDER[codeOf(b)] ?? 99));
  }

  // --- State ---
  let grid = {};
  let activePosCode = null;
  let squad = null;
  let scoutSquad = null;
  let currentTab = 'squadDepth';

  // --- DOM Elements ---
  const el = {
    fmPitchGrid: document.getElementById('fmPitchGrid'),
    clearTacticBtn: document.getElementById('clearTacticBtn'),
    formationNameInput: document.getElementById('formationNameInput'),
    saveFormationBtn: document.getElementById('saveFormationBtn'),
    savedFormationsSelect: document.getElementById('savedFormationsSelect'),
    loadFormationBtn: document.getElementById('loadFormationBtn'),
    deleteFormationBtn: document.getElementById('deleteFormationBtn'),
    formationSaveStatus: document.getElementById('formationSaveStatus'),
    editor: document.getElementById('slotEditor'),
    editorTitle: document.getElementById('editorTitle'),
    editorPosition: document.getElementById('editorPosition'),
    editorRole: document.getElementById('editorRole'),
    removeSlotBtn: document.getElementById('removeSlotBtn'),
    csvInput: document.getElementById('csvInput'),
    fileDrop: document.getElementById('fileDrop'),
    importStatus: document.getElementById('importStatus'),
    scoutCsvInput: document.getElementById('scoutCsvInput'),
    scoutFileDrop: document.getElementById('scoutFileDrop'),
    scoutImportStatus: document.getElementById('scoutImportStatus'),
    emptyState: document.getElementById('emptyState'),
    bestXiPanel: document.getElementById('bestXiPanel'),
    bestXiTable: document.getElementById('bestXiTable'),
    slotPanels: document.getElementById('slotPanels'),
    relatedOnlyToggle: document.getElementById('relatedOnlyToggle'),
    potentialToggle: document.getElementById('potentialToggle'),
    hideInjuredToggle: document.getElementById('hideInjuredToggle'),
    hideInjuredLabel: document.getElementById('hideInjuredLabel'),
    hideInjuredCount: document.getElementById('hideInjuredCount'),
    fitnessToggle: document.getElementById('fitnessToggle'),
    fitnessLabel: document.getElementById('fitnessLabel'),
    tabBtnSquadDepth: document.getElementById('tabBtnSquadDepth'),
    tabBtnTacticalFit: document.getElementById('tabBtnTacticalFit'),
    tabBtnPotential: document.getElementById('tabBtnPotential'),
    tabBtnScouting: document.getElementById('tabBtnScouting'),
    tabSquadDepth: document.getElementById('tabSquadDepth'),
    tabTacticalFit: document.getElementById('tabTacticalFit'),
    tabPotential: document.getElementById('tabPotential'),
    tabScouting: document.getElementById('tabScouting'),
    squadDepthPanel: document.getElementById('squadDepthPanel'),
    depthSummaryGrid: document.getElementById('depthSummaryGrid'),
    squadDepthTable: document.getElementById('squadDepthTable'),
    potentialInfoPanel: document.getElementById('potentialInfoPanel'),
    potentialPanels: document.getElementById('potentialPanels'),
    tabBtnPlayerSearch: document.getElementById('tabBtnPlayerSearch'),
    tabPlayerSearch: document.getElementById('tabPlayerSearch'),
    playerSearchEmptyState: document.getElementById('playerSearchEmptyState'),
    playerSearchPanel: document.getElementById('playerSearchPanel'),
    playerSearchInput: document.getElementById('playerSearchInput'),
    playerSearchResults: document.getElementById('playerSearchResults'),
    playerOverviewPanels: document.getElementById('playerOverviewPanels'),
    tabBtnFinancial: document.getElementById('tabBtnFinancial'),
    tabFinancial: document.getElementById('tabFinancial'),
    financialInfoPanel: document.getElementById('financialInfoPanel'),
    financialEmptyState: document.getElementById('financialEmptyState'),
    financialTableWrap: document.getElementById('financialTableWrap'),
    financialTable: document.getElementById('financialTable'),
    scoutingEmptyState: document.getElementById('scoutingEmptyState'),
    scoutingFiltersBar: document.getElementById('scoutingFiltersBar'),
    scoutSearchInput: document.getElementById('scoutSearchInput'),
    scoutMaxAgeInput: document.getElementById('scoutMaxAgeInput'),
    scoutMinScoreInput: document.getElementById('scoutMinScoreInput'),
    scoutMinPotentialInput: document.getElementById('scoutMinPotentialInput'),
    scoutClearFiltersBtn: document.getElementById('scoutClearFiltersBtn'),
    scoutingPanels: document.getElementById('scoutingPanels'),
    autoRolesBtn: document.getElementById('autoRolesBtn'),
    editorOopRole: document.getElementById('editorOopRole'),
    editorKeyAttrs: document.getElementById('editorKeyAttrs'),
    hiddenSelect: document.getElementById('hiddenSelect'),
    ratingModelSelect: document.getElementById('ratingModelSelect'),
    benchPanel: document.getElementById('benchPanel'),
    benchBody: document.getElementById('benchBody'),
    tabBtnTactics: document.getElementById('tabBtnTactics'),
    tabBtnTeamInfo: document.getElementById('tabBtnTeamInfo'),
    tabBtnYoungsters: document.getElementById('tabBtnYoungsters'),
    tabBtnWorld: document.getElementById('tabBtnWorld'),
    tabTactics: document.getElementById('tabTactics'),
    tabTeamInfo: document.getElementById('tabTeamInfo'),
    tabYoungsters: document.getElementById('tabYoungsters'),
    tabWorld: document.getElementById('tabWorld'),
    tacticsBody: document.getElementById('tacticsBody'),
    teamInfoBody: document.getElementById('teamInfoBody'),
    youngstersBody: document.getElementById('youngstersBody'),
    worldBody: document.getElementById('worldBody'),
  };

  // Per-position sort state for the Scouting tab tables - {field: 'score'|'potential', dir: 'asc'|'desc'}
  let scoutSortState = {};

  // Cached scouting rankings (see computeAndRender) and a version bumped whenever the pool is replaced.
  let scoutCache = null;
  let scoutVersion = 0;
  // Each position's table starts with the best 200 rows and grows on request (per position).
  const MAX_SCOUT_ROWS = 200;
  let scoutShown = {};
  // The scouting ranking is the slow part (every pool player against every position), so it only runs
  // while the Scouting tab is open; elsewhere it is just marked out of date and done when you switch.
  let scoutStale = false;

  // Currently selected player on the Player Search tab.
  let searchedPlayer = null;
  // Position Fit table scope: 'all' (every pitch position) or a positionCode from the current tactic grid.
  let positionFitFilter = 'all';

  // --- Helper Methods ---

  // --- Helper Methods ---

  /** The engine options currently set in the toolbar. */
  function rankOptions() {
    const key = el.hiddenSelect ? el.hiddenSelect.value : 'normal';
    const model = el.ratingModelSelect ? el.ratingModelSelect.value : 'blend';
    return {
      factorPotential: el.potentialToggle ? el.potentialToggle.checked : false,
      hidden: HIDDEN_STRENGTH[key] !== undefined ? HIDDEN_STRENGTH[key] : HIDDEN_STRENGTH.normal,
      engineShare: RATING_MODELS[model] !== undefined ? RATING_MODELS[model] : RATING_MODELS.blend,
      ipWeight: 0.5,
    };
  }

  /** Match-engine fit (0-100) with the attributes behind it in the tooltip; '—' where it can't be worked out. */
  function impactHtml(player) {
    const f = engineFit20(player);
    if (f === null) return '<span style="color:var(--muted-2)">—</span>';
    const top = engineDrivers(player).slice(0, 6).map(d => `${d.name} ${Math.round(d.value)}`).join(' · ');
    const tip = `Match-engine fit: his attributes weighted by what they were worth in FM27 matches (Fm-Match-Lab). ${top}`;
    return `<span class="score-pill impact-pill" title="${esc(tip)}">${(f * 5).toFixed(1)}</span>`;
  }

  function posLabelOf(code) {
    return POSITION_SLOT_MAP[code] ? POSITION_SLOT_MAP[code].label : code;
  }

  function esc(text) {
    return String(text === undefined || text === null ? '' : text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function famTagHtml(fam) {
    if (!fam) return '';
    const cls = 'fam-' + (fam.tier || 'unknown').toLowerCase();
    const tip = fam.rating ? ` title="Position rating ${fam.rating}/20"` : '';
    return `<span class="fam-tag ${cls}"${tip}>${fam.label || fam.tier}</span>`;
  }

  /** How much his availability moves a rating, with what it is made of in the tooltip. */
  function hiddenTagHtml(r) {
    if (!r || r.hiddenMultiplier === undefined || !r.player) return '';
    const p = hiddenProfile(r.player);
    const pct = (r.hiddenMultiplier - 1) * 100;
    const f = (x) => (x === null ? '—' : (x * 20).toFixed(0));
    const ta = p.tacticalAbility === null ? '—' : p.tacticalAbility;
    const tip = `Availability ${f(p.availability)}/20 (injury proneness, natural fitness) · Tactical ability ${ta}/100 (the game's formula; shown only)`;
    const cls = pct > 0.4 ? 'hid-up' : (pct < -0.4 ? 'hid-down' : 'hid-flat');
    return `<span class="hidden-tag ${cls}" title="${tip}">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>`;
  }

  function ipOopCell(r) {
    const f = (x) => (x === null || x === undefined ? '—' : x.toFixed(0));
    const eng = r.engineFit === null || r.engineFit === undefined ? '' : `; match-engine fit ${f(r.engineFit)}`;
    return `<span title="Role fit in possession / out of possession (0-100)${eng}">${f(r.ipFit)} / ${f(r.oopFit)}</span>`;
  }

  // Shown beside a name while injured players are still listed (the "Hide injured players" box is off).
  function injuryTagHtml(player) {
    if (!player || !player.injured) return '';
    const why = String(player.injury || 'Injured').replace(/"/g, '&quot;');
    return ` <span class="injury-tag" title="${why}">Injured</span>`;
  }

  // The checkbox only means something on the two squad lists, and only when the data says who is injured.
  function updateInjuredToggle() {
    if (!el.hideInjuredLabel) return;
    const players = squad ? squad.players : [];
    const known = players.some(p => typeof p.injured === 'boolean');
    el.hideInjuredLabel.hidden = !(known && (currentTab === 'squadDepth' || currentTab === 'tacticalFit' || currentTab === 'tactics'));
    if (el.hideInjuredCount) {
      const n = players.filter(p => p.injured).length;
      el.hideInjuredCount.textContent = known ? ` (${n} injured)` : '';
    }
  }

  // --- Today's fitness: condition and match sharpness (live data only; a CSV import doesn't carry them) ---

  function squadHasFitness() {
    return !!(squad && squad.players.some(p => typeof p.condition === 'number'));
  }

  /** Is "Use today's fitness" on, with something for it to use? */
  function useTodaysFitness() {
    return !!(el.fitnessToggle && el.fitnessToggle.checked && squadHasFitness());
  }

  /** The toolbar options for rating our own squad for today's match: rankOptions() plus today's fitness. */
  function squadOptions() {
    return Object.assign(rankOptions(), { fitness: useTodaysFitness() });
  }

  function updateFitnessToggle() {
    if (!el.fitnessLabel) return;
    el.fitnessLabel.hidden = !(squadHasFitness() && ['squadDepth', 'tacticalFit', 'tactics', 'teamInfo'].includes(currentTab));
  }

  // Colours roughly follow the game's own icons: its heart drops from "Excellent" to "Good" at about 86% and to
  // "Fair" below 75%; the sharpness tick needs about 85%, and below 60% it reads "Lacking Sharpness".
  function fitClass(v, ok, low) {
    return v >= ok ? 'fit-ok' : (v >= low ? 'fit-mid' : 'fit-low');
  }

  /** "Condition / sharpness" cell, with what they cost in the tooltip. */
  function fitnessHtml(player) {
    if (!player || typeof player.condition !== 'number') return '<span style="color:var(--muted-2)">—</span>';
    const con = player.condition;
    const shp = typeof player.sharpness === 'number' ? player.sharpness : null;
    const f = fitnessCost(player);
    const cost = f.cost20 >= 0.05
      ? `: costs his team about ${(-f.ppg).toFixed(2)} points per game, like ${f.cost20.toFixed(1)} off every attribute${useTodaysFitness() ? '' : ' (tick "Use today\'s fitness" to count it)'}`
      : ': fully fit';
    const tip = `Condition ${Math.round(con)}% · match sharpness ${shp === null ? '?' : Math.round(shp) + '%'} today${cost}`;
    const shpHtml = shp === null ? '—' : `<span class="${fitClass(shp, 85, 60)}">${Math.round(shp)}%</span>`;
    return `<span class="fit-tag" title="${esc(tip)}"><span class="${fitClass(con, 86, 75)}">${Math.round(con)}%</span> / ${shpHtml}</span>`;
  }

  const FIT_TH = '<th title="Condition / match sharpness today, read from the game">Con / Shp</th>';

  function potentialHtml(val) {
    if (val === null || val === undefined) return '<span style="color:var(--muted-2)">—</span>';
    return `<span class="potential-pill">${val.toFixed(1)}\u2605</span>`;
  }

  // --- Saved Formations (localStorage) ---
  //
  // Keeps every saved tactic grid (position/role/duty per slot) under one
  // JSON blob in localStorage, keyed by whatever name the user gives it.
  // Everything here stays on-device, same as the rest of the app -
  // nothing is ever sent anywhere.
  const FORMATIONS_STORAGE_KEY = 'fm26TacticBuilder.savedFormations';

  function loadSavedFormations() {
    try {
      const raw = localStorage.getItem(FORMATIONS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function writeSavedFormations(formations) {
    try {
      localStorage.setItem(FORMATIONS_STORAGE_KEY, JSON.stringify(formations));
      return true;
    } catch (err) {
      return false;
    }
  }

  function setFormationStatus(text) {
    if (el.formationSaveStatus) el.formationSaveStatus.textContent = text;
  }

  function refreshSavedFormationsSelect(selectName) {
    if (!el.savedFormationsSelect) return;
    const formations = loadSavedFormations();
    const names = Object.keys(formations).sort((a, b) => a.localeCompare(b));

    el.savedFormationsSelect.innerHTML = '<option value="">— Saved formations —</option>';
    names.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      el.savedFormationsSelect.appendChild(opt);
    });

    if (selectName && names.includes(selectName)) {
      el.savedFormationsSelect.value = selectName;
    }
  }

  function saveCurrentFormation() {
    if (!el.formationNameInput) return;
    const name = el.formationNameInput.value.trim();
    if (!name) {
      setFormationStatus('Enter a name for this formation before saving.');
      return;
    }
    if (Object.keys(grid).length === 0) {
      setFormationStatus('Add at least one position to the pitch before saving.');
      return;
    }

    const formations = loadSavedFormations();
    const overwriting = Object.prototype.hasOwnProperty.call(formations, name);
    if (overwriting && !window.confirm(`"${name}" already exists — overwrite it with the current pitch tactic?`)) {
      return;
    }

    formations[name] = JSON.parse(JSON.stringify(grid));
    const ok = writeSavedFormations(formations);
    setFormationStatus(ok ? `Saved "${name}".` : 'Could not save — browser storage may be full or disabled.');
    if (ok) {
      refreshSavedFormationsSelect(name);
      el.formationNameInput.value = '';
    }
  }

  function loadSelectedFormation() {
    if (!el.savedFormationsSelect) return;
    const name = el.savedFormationsSelect.value;
    if (!name) {
      setFormationStatus('Pick a saved formation to load.');
      return;
    }
    const formations = loadSavedFormations();
    const saved = formations[name];
    if (!saved) {
      setFormationStatus(`Could not find "${name}".`);
      return;
    }
    if (Object.keys(grid).length > 0 && !window.confirm(`Load "${name}"? This replaces your current pitch tactic.`)) {
      return;
    }

    grid = migrateGrid(saved);
    activePosCode = null;
    if (el.editor) el.editor.hidden = true;
    setFormationStatus(`Loaded "${name}".`);
    computeAndRender();
  }

  function deleteSelectedFormation() {
    if (!el.savedFormationsSelect) return;
    const name = el.savedFormationsSelect.value;
    if (!name) {
      setFormationStatus('Pick a saved formation to delete.');
      return;
    }
    if (!window.confirm(`Delete saved formation "${name}"? This can't be undone.`)) return;

    const formations = loadSavedFormations();
    delete formations[name];
    writeSavedFormations(formations);
    setFormationStatus(`Deleted "${name}".`);
    refreshSavedFormationsSelect();
  }

  // --- Pitch Grid Renderer ---

  function renderPitchGrid() {
    if (!el.fmPitchGrid) return;
    el.fmPitchGrid.innerHTML = '';

    PITCH_MATRIX.forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'pitch-row';

      row.forEach(posCode => {
        const cell = document.createElement('div');
        cell.className = 'pitch-cell';

        if (!posCode) {
          cell.classList.add('empty-cell');
        } else {
          const activeSlot = grid[posCode];
          const isSelected = activePosCode === posCode;

          if (activeSlot) {
            cell.classList.add('active-slot');
            if (isSelected) cell.classList.add('selected');

            const role = slotRole(activeSlot);
            cell.title = `${role.ip.name} (in possession) / ${role.oop.name} (out of possession) — ${posLabelOf(posCode)}`;
            cell.innerHTML = `
              <div class="slot-badge">${posCode}</div>
              <div class="slot-name">${role.ip.name}</div>
              <div class="slot-duty">${role.oop.name}</div>
              <div class="slot-pos-label">${posLabelOf(posCode)}</div>
            `;
            cell.addEventListener('click', () => selectSlot(posCode));
          } else {
            cell.classList.add('add-slot');
            cell.innerHTML = `<button type="button" class="btn-add-slot" title="Add ${posCode}">+</button>`;
            cell.addEventListener('click', () => addSlotAt(posCode));
          }
        }

        rowDiv.appendChild(cell);
      });

      el.fmPitchGrid.appendChild(rowDiv);
    });
  }

  // --- Slot Handlers ---

  /** A saved or built-in grid in this version's shape (older saves had one role + a duty per slot). */
  function migrateGrid(saved) {
    const out = {};
    Object.keys(saved || {}).forEach(code => {
      if (POSITION_SLOT_MAP[code]) out[code] = migrateSlot(Object.assign({ positionCode: code }, saved[code]));
    });
    return out;
  }

  function addSlotAt(posCode) {
    grid[posCode] = Object.assign({ positionCode: posCode }, defaultRoleIds(posCode));
    selectSlot(posCode);
    computeAndRender();
  }

  function selectSlot(posCode) {
    activePosCode = posCode;
    const slot = grid[posCode];

    if (!slot) {
      if (el.editor) el.editor.hidden = true;
      renderPitchGrid();
      return;
    }

    if (el.editor) el.editor.hidden = false;
    if (el.editorTitle) el.editorTitle.textContent = `Edit Slot: ${posLabelOf(posCode)}`;

    if (el.editorPosition) {
      el.editorPosition.innerHTML = `<option value="${posCode}">${posLabelOf(posCode)} (${posCode})</option>`;
      el.editorPosition.value = posCode;
    }

    populateRoleSelects(posCode, slot);
    renderPitchGrid();
  }

  /** Fills the two role lists with what FM27 offers at this position, and shows each role's Key attributes. */
  function populateRoleSelects(posCode, slot) {
    const fill = (select, phase, selectedId) => {
      if (!select) return;
      select.innerHTML = '';
      GET_ROLES_FOR_POSITION(posCode, phase).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (r.id === selectedId) opt.selected = true;
        select.appendChild(opt);
      });
    };
    fill(el.editorRole, 'ip', slot.ipRoleId);
    fill(el.editorOopRole, 'oop', slot.oopRoleId);
    updateEditorHint(slot);
  }

  function updateEditorHint(slot) {
    if (!el.editorKeyAttrs) return;
    const role = slotRole(slot);
    el.editorKeyAttrs.innerHTML = `<strong>In possession</strong> key attributes: ${role.ip.keyAttrs.join(', ')}.<br><strong>Out of possession</strong> key attributes: ${role.oop.keyAttrs.join(', ')}.`;
  }

  /** Picks, for every slot, the roles that suit the squad's best players for that position. */
  function autoPickRoles() {
    if (!squad || !Object.keys(grid).length) return;
    const options = rankOptions();
    Object.keys(grid).forEach(code => {
      grid[code] = suggestRoles(code, squad.players, options);
    });
    if (activePosCode && grid[activePosCode]) populateRoleSelects(activePosCode, grid[activePosCode]);
    computeAndRender();
  }

  // --- Computation Pipeline ---

  function computeAndRender() {
    renderPitchGrid();

    const activeSlots = Object.values(grid);
    const hideForeign = el.relatedOnlyToggle ? el.relatedOnlyToggle.checked : false;
    const hideInjured = el.hideInjuredToggle ? el.hideInjuredToggle.checked : false;
    const options = rankOptions();
    const squadOpts = squadOptions();            // + today's fitness, for our own squad only
    updateInjuredToggle();
    updateFitnessToggle();

    // --- Main squad (Squad Depth + Tactical Fit tabs) ---
    if (!squad || activeSlots.length === 0) {
      if (el.emptyState) el.emptyState.hidden = false;
      if (el.squadDepthPanel) el.squadDepthPanel.hidden = true;
      if (el.bestXiPanel) el.bestXiPanel.hidden = true;
      if (el.benchPanel) el.benchPanel.hidden = true;
      if (el.slotPanels) el.slotPanels.innerHTML = '';
      if (el.potentialInfoPanel) el.potentialInfoPanel.hidden = true;
      if (el.potentialPanels) el.potentialPanels.innerHTML = '';
    } else {
      if (el.emptyState) el.emptyState.hidden = true;

      const rankedSlots = activeSlots.map(slot => {
        const role = slotRole(slot);
        let ranked = rankPlayersForSlot(slot, role, squad.players, squadOpts);
        if (hideForeign) {
          ranked = ranked.filter(r => !isUnfamiliar(r.familiarity));
        }
        if (hideInjured) {
          ranked = ranked.filter(r => !r.player.injured);
        }
        return { slot, role, ranked };
      });

      if (el.squadDepthPanel) el.squadDepthPanel.hidden = false;
      const depthData = computeSquadDepth(rankedSlots);
      renderSquadDepth(depthData);

      if (el.bestXiPanel) el.bestXiPanel.hidden = false;
      const assignment = greedyBestXI(rankedSlots);
      renderBestXiTable(rankedSlots, assignment);
      renderBench(rankedSlots, assignment, depthData);

      if (el.slotPanels) {
        el.slotPanels.innerHTML = '';
        inPitchOrder(rankedSlots, rs => rs.slot.positionCode).forEach(rs => {
          el.slotPanels.appendChild(buildSlotPanel(rs, 10));
        });
      }

      if (el.potentialInfoPanel) el.potentialInfoPanel.hidden = false;
      if (el.potentialPanels) {
        el.potentialPanels.innerHTML = '';
        inPitchOrder(activeSlots, s => s.positionCode).forEach(slot => {
          const role = slotRole(slot);
          let ranked = rankPlayersForPotential(slot, role, squad.players, options);
          if (hideForeign) {
            ranked = ranked.filter(r => !isUnfamiliar(r.familiarity));
          }
          el.potentialPanels.appendChild(buildPotentialSlotPanel({ slot, role, ranked }, 10));
        });
      }
    }

    // --- Scouting tab: independent of the main squad, only needs a
    // scouting file + at least one active tactic slot ---
    if (!scoutSquad || activeSlots.length === 0) {
      if (el.scoutingEmptyState) {
        el.scoutingEmptyState.hidden = false;
        el.scoutingEmptyState.querySelector('p').textContent = !scoutSquad
          ? 'Import a scouting CSV export on the left to see how those players fit your tactic.'
          : 'Add at least one position to your tactic grid to rank scouted players against it.';
      }
      if (el.scoutingFiltersBar) el.scoutingFiltersBar.hidden = true;
      if (el.scoutingPanels) el.scoutingPanels.innerHTML = '';
    } else {
      if (el.scoutingEmptyState) el.scoutingEmptyState.hidden = true;
      if (el.scoutingFiltersBar) el.scoutingFiltersBar.hidden = false;

      const scoutFilters = readScoutFilters();

      // Ranking a big scouting pool is the expensive part, so cache it and
      // only redo it when the tactic, toggles or the pool itself change -
      // typing in a filter box or re-sorting just re-filters the cached rows.
      const scoutCacheKey = JSON.stringify([
        activeSlots.map(s => [s.positionCode, s.ipRoleId, s.oopRoleId]), hideForeign,
        options.factorPotential, options.hidden, options.engineShare, options.ipWeight, scoutVersion,
      ]);
      const needsRanking = !scoutCache || scoutCache.key !== scoutCacheKey;
      if (needsRanking && currentTab !== 'scouting') {
        scoutStale = true;          // done when the Scouting tab is opened (see switchTab)
      } else {
        scoutStale = false;
        if (needsRanking) {
          scoutCache = {
            key: scoutCacheKey,
            slots: inPitchOrder(activeSlots, s => s.positionCode).map(slot => {
              const role = slotRole(slot);
              const fitRanked = rankPlayersForSlot(slot, role, scoutSquad.players, options);
              const potentialRanked = rankPlayersForPotential(slot, role, scoutSquad.players, options);
              const potentialByPlayer = new Map(potentialRanked.map(r => [r.player, r]));

              let merged = fitRanked.map(r => {
                const pot = potentialByPlayer.get(r.player);
                return {
                  player: r.player,
                  score: r.score,
                  ipFit: r.ipFit,
                  oopFit: r.oopFit,
                  hiddenMultiplier: r.hiddenMultiplier,
                  potentialScore: pot ? pot.score : null,
                  familiarity: r.familiarity,
                  potentialStars: r.potential,
                };
              });

              if (hideForeign) {
                merged = merged.filter(r => !isUnfamiliar(r.familiarity));
              }
              return { slot, role, rows: merged };
            }),
          };
        }

        const rankedScoutSlots = scoutCache.slots.map(c => ({
          slot: c.slot,
          role: c.role,
          ranked: sortScoutRows(applyScoutFilters(c.rows, scoutFilters), c.slot.positionCode),
        }));

        if (el.scoutingPanels) {
          el.scoutingPanels.innerHTML = '';
          rankedScoutSlots.forEach(rs => {
            // Each table shows the best rows (200 to start, more on request); the table
            // scrolls so the panel height stays constant however long it gets.
            el.scoutingPanels.appendChild(buildScoutingSlotPanel(rs));
          });
        }
      }
    }

    renderPlayerSearchTab();
    renderFinancialTab();
    renderExtraTab();
  }

  /** The tabs that are built on demand (they only render while open). */
  function renderExtraTab() {
    if (currentTab === 'tactics') renderTacticAdvisor();
    else if (currentTab === 'teamInfo') renderTeamInfo();
    else if (currentTab === 'youngsters') renderYoungsters();
    else if (currentTab === 'world') renderWorld();
  }

  // --- View Renderers ---

  function renderSquadDepth(depthData) {
    if (!el.squadDepthTable || !el.depthSummaryGrid) return;

    const totalPossible = depthData.depthSlots.length * 3;
    const getPosLabel = (code) => POSITION_SLOT_MAP[code] ? POSITION_SLOT_MAP[code].label : code;

    const strongestName = depthData.strongestPos 
      ? getPosLabel(depthData.strongestPos.slot.positionCode) + ' (' + depthData.strongestPos.avgScore.toFixed(1) + ')'
      : 'N/A';
    const weakestName = depthData.weakestPos 
      ? getPosLabel(depthData.weakestPos.slot.positionCode) + ' (' + depthData.weakestPos.avgScore.toFixed(1) + ')'
      : 'N/A';

    el.depthSummaryGrid.innerHTML = `
      <div class="depth-summary-card">
        <span class="label">Squad Depth Avg</span>
        <span class="val"><span class="score-pill depth-avg">${depthData.overallAvgScore.toFixed(1)}</span></span>
        <span class="sub">Across all choices</span>
      </div>
      <div class="depth-summary-card">
        <span class="label">Players Assigned</span>
        <span class="val">${depthData.totalAssigned} / ${totalPossible}</span>
        <span class="sub">Unique squad members</span>
      </div>
      <div class="depth-summary-card">
        <span class="label">Strongest Position</span>
        <span class="val" style="font-size:13px;margin-top:4px">${strongestName}</span>
        <span class="sub">Top 3-player average</span>
      </div>
      <div class="depth-summary-card">
        <span class="label">Weakest Position</span>
        <span class="val" style="font-size:13px;margin-top:4px">${weakestName}</span>
        <span class="sub">Lowest 3-player average</span>
      </div>
    `;

    const showFit = squadHasFitness();
    const rows = inPitchOrder(depthData.depthSlots, ds => ds.slot.positionCode).map(ds => {
      const posLabel = getPosLabel(ds.slot.positionCode);
      const roleLabel = ds.role ? ds.role.name : '';

      const playerCell = (r) => {
        if (!r) return '<td class="depth-player-cell"><span style="color:var(--muted-2)">—</span></td>';
        return `
          <td class="depth-player-cell">
            <div class="depth-player-card">
              <div class="p-name">${r.player.info.Player} <span class="p-age">(${r.player.info.Age || '—'})</span>${injuryTagHtml(r.player)}</div>
              <div class="p-meta"><span class="score-pill">${r.score.toFixed(1)}</span> ${famTagHtml(r.familiarity)} ${potentialHtml(r.potential)}${showFit ? ' ' + fitnessHtml(r.player) : ''}</div>
            </div>
          </td>
        `;
      };

      return `
        <tr>
          <td><strong>${posLabel}</strong><br><span style="color:var(--muted);font-size:12px">${roleLabel}</span></td>
          ${playerCell(ds.players[0])}
          ${playerCell(ds.players[1])}
          ${playerCell(ds.players[2])}
          <td><span class="score-pill depth-avg">${ds.avgScore.toFixed(1)}</span></td>
        </tr>
      `;
    }).join('');

    el.squadDepthTable.innerHTML = `
      <thead>
        <tr>
          <th>Position</th>
          <th>1st Choice (Starter)</th>
          <th>2nd Choice (Backup)</th>
          <th>3rd Choice (Rotation)</th>
          <th>Pos. Avg</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    `;
  }

  function renderBestXiTable(gridRanked, assignment) {
    if (!el.bestXiTable) return;
    const showFit = squadHasFitness();
    const rows = inPitchOrder(gridRanked.map((gr, idx) => ({ gr, idx })), x => x.gr.slot.positionCode).map(({ gr, idx }) => {
      const assigned = assignment[idx];
      const posLabel = posLabelOf(gr.slot.positionCode);
      const roleLabel = gr.role ? gr.role.name : '';

      if (!assigned) {
        return `<tr>
          <td><strong>${posLabel}</strong></td>
          <td>${roleLabel}</td>
          <td colspan="${showFit ? 8 : 7}" style="color:var(--muted)">No eligible player available</td>
        </tr>`;
      }

      return `<tr>
        <td><strong>${posLabel}</strong></td>
        <td>${roleLabel}</td>
        <td><strong>${esc(assigned.player.info.Player)}</strong>${injuryTagHtml(assigned.player)}</td>
        <td>${assigned.player.info.Age || '—'}</td>
        ${showFit ? `<td>${fitnessHtml(assigned.player)}</td>` : ''}
        <td><span class="score-pill">${assigned.score.toFixed(1)}</span></td>
        <td>${ipOopCell(assigned)}</td>
        <td>${famTagHtml(assigned.familiarity)}</td>
        <td>${hiddenTagHtml(assigned)}</td>
        <td>${potentialHtml(assigned.potential)}</td>
      </tr>`;
    }).join('');

    el.bestXiTable.innerHTML = `
      <thead>
        <tr>
          <th>Position</th>
          <th>Roles (in / out of possession)</th>
          <th>Suggested Player</th>
          <th>Age</th>
          ${showFit ? FIT_TH : ''}
          <th>Rating</th>
          <th>IP / OOP fit</th>
          <th>Familiarity</th>
          <th title="How much his availability (injury proneness, natural fitness) moves his rating">Avail.</th>
          <th>Potential</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    `;
  }

  function buildSlotPanel(rs, topN) {
    const posLabel = posLabelOf(rs.slot.positionCode);
    const roleName = rs.role ? rs.role.name : '';

    const panel = document.createElement('div');
    panel.className = 'panel slot-detail-panel';

    const showFit = squadHasFitness();
    const topPlayers = rs.ranked.slice(0, topN || 10);
    const tableRows = topPlayers.map((r, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td><strong>${esc(r.player.info.Player)}</strong>${injuryTagHtml(r.player)}</td>
        <td>${r.player.info.Age || '—'}</td>
        ${showFit ? `<td>${fitnessHtml(r.player)}</td>` : ''}
        <td><span class="score-pill">${r.score.toFixed(1)}</span></td>
        <td>${ipOopCell(r)}</td>
        <td>${famTagHtml(r.familiarity)}</td>
        <td>${hiddenTagHtml(r)}</td>
        <td>${potentialHtml(r.potential)}</td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div class="panel-head">
        <h2>${posLabel} — ${roleName}</h2>
      </div>
      <div class="table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Age</th>
              ${showFit ? FIT_TH : ''}
              <th>Score</th>
              <th>IP / OOP fit</th>
              <th>Familiarity</th>
              <th title="How much his availability (injury proneness, natural fitness) moves his rating">Avail.</th>
              <th>Potential</th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="${showFit ? 9 : 8}">No matching players found</td></tr>`}</tbody>
        </table>
      </div>
    `;
    return panel;
  }

  /** Bench (the nine who cover the most ground) and the rotation XI (each position's second choice). */
  function renderBench(rankedSlots, assignment, depthData) {
    if (!el.benchPanel || !el.benchBody) return;
    el.benchPanel.hidden = false;
    const bench = computeBench(rankedSlots, assignment, 9);
    const showFit = squadHasFitness();

    const benchRows = bench.map((b, i) => `
      <tr>
        <td>S${i + 1}</td>
        <td><strong>${esc(b.player.info.Player)}</strong>${injuryTagHtml(b.player)}</td>
        <td>${b.player.info.Age || '—'}</td>
        ${showFit ? `<td>${fitnessHtml(b.player)}</td>` : ''}
        <td>${posLabelOf(b.slot.positionCode)}</td>
        <td><span class="score-pill">${b.entry.score.toFixed(1)}</span></td>
        <td>${Math.round(b.cover * 100)}% of the starter</td>
        <td>${famTagHtml(b.entry.familiarity)}</td>
      </tr>`).join('');

    const rotRows = inPitchOrder(depthData.depthSlots, ds => ds.slot.positionCode).map(ds => {
      const r = ds.players[1];
      return `<tr>
        <td><strong>${posLabelOf(ds.slot.positionCode)}</strong></td>
        <td>${r ? `<strong>${esc(r.player.info.Player)}</strong>${injuryTagHtml(r.player)}` : '<span style="color:var(--muted-2)">—</span>'}</td>
        <td>${r ? (r.player.info.Age || '—') : ''}</td>
        ${showFit ? `<td>${r ? fitnessHtml(r.player) : ''}</td>` : ''}
        <td>${r ? `<span class="score-pill">${r.score.toFixed(1)}</span>` : ''}</td>
        <td>${r ? famTagHtml(r.familiarity) : ''}</td>
      </tr>`;
    }).join('');

    el.benchBody.innerHTML = `
      <div class="two-col">
        <div>
          <h3 class="sub-h">Bench</h3>
          <div class="table-wrap"><table class="results-table">
            <thead><tr><th></th><th>Player</th><th>Age</th>${showFit ? FIT_TH : ''}<th>Covers</th><th>Rating</th><th>Cover</th><th>Familiarity</th></tr></thead>
            <tbody>${benchRows || `<tr><td colspan="${showFit ? 8 : 7}">Nobody left to name</td></tr>`}</tbody>
          </table></div>
        </div>
        <div>
          <h3 class="sub-h">Rotation XI (second choices)</h3>
          <div class="table-wrap"><table class="results-table">
            <thead><tr><th>Position</th><th>Player</th><th>Age</th>${showFit ? FIT_TH : ''}<th>Rating</th><th>Familiarity</th></tr></thead>
            <tbody>${rotRows}</tbody>
          </table></div>
        </div>
      </div>`;
  }

  // Estimated interest in joining your club: one tag for a transfer, one for a loan (live data only).
  const INTEREST_CLASS = { 'Interested': 'int-3', 'Persuadable': 'int-2', 'Doubtful': 'int-1', 'Not interested': 'int-0', 'Not possible': 'int-x' };
  function interestTagsHtml(p) {
    const t = p.raw['Interest'];
    const l = p.raw['Loan Interest'];
    if (!t && !l) return '<span style="color:var(--muted-2)">—</span>';
    const tag = (kind, letter, v) => v
      ? `<span class="int-tag ${INTEREST_CLASS[v] || 'int-x'}" title="${kind}: ${v.toLowerCase()} (estimate)">${letter} ${esc(v === 'Not interested' ? 'no' : (v === 'Not possible' ? 'n/a' : v.toLowerCase()))}</span>`
      : '';
    return tag('Transfer', 'T', t) + tag('Loan', 'L', l);
  }

  // --- Scouting: filters, sorting, and its own scrollable panel ---

  function readScoutFilters() {
    return {
      search: el.scoutSearchInput ? el.scoutSearchInput.value.trim().toLowerCase() : '',
      maxAge: el.scoutMaxAgeInput && el.scoutMaxAgeInput.value !== '' ? parseInt(el.scoutMaxAgeInput.value, 10) : null,
      minScore: el.scoutMinScoreInput && el.scoutMinScoreInput.value !== '' ? parseFloat(el.scoutMinScoreInput.value) : null,
      minPotential: el.scoutMinPotentialInput && el.scoutMinPotentialInput.value !== '' ? parseFloat(el.scoutMinPotentialInput.value) : null,
    };
  }

  function applyScoutFilters(rows, filters) {
    return rows.filter(r => {
      if (filters.search && !r.player.info.Player.toLowerCase().includes(filters.search)) return false;
      if (filters.maxAge !== null && !isNaN(filters.maxAge)) {
        if (r.player.info.Age === null || r.player.info.Age > filters.maxAge) return false;
      }
      if (filters.minScore !== null && !isNaN(filters.minScore) && r.score < filters.minScore) return false;
      if (filters.minPotential !== null && !isNaN(filters.minPotential)) {
        if (r.potentialScore === null || r.potentialScore < filters.minPotential) return false;
      }
      return true;
    });
  }

  function sortScoutRows(rows, positionCode) {
    const state = scoutSortState[positionCode] || { field: 'score', dir: 'desc' };
    const val = (r) => (state.field === 'potential' ? r.potentialScore
      : (state.field === 'impact' ? engineFit20(r.player) : r.score));
    return [...rows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const aVal = av === null || av === undefined ? -Infinity : av;
      const bVal = bv === null || bv === undefined ? -Infinity : bv;
      return state.dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  function buildScoutingSlotPanel(rs) {
    const posLabel = POSITION_SLOT_MAP[rs.slot.positionCode]
      ? POSITION_SLOT_MAP[rs.slot.positionCode].label
      : rs.slot.positionCode;
    const roleName = rs.role ? rs.role.name : '';
    const positionCode = rs.slot.positionCode;
    const sortState = scoutSortState[positionCode] || { field: 'score', dir: 'desc' };
    const sortArrow = (field) => (sortState.field === field ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '');

    const panel = document.createElement('div');
    panel.className = 'panel slot-detail-panel';

    const rows = rs.ranked;
    // A live-data pool can be thousands of players deep; render the best rows
    // and say so (with buttons for more), rather than building tens of
    // thousands of table rows per position.
    const limit = scoutShown[positionCode] || MAX_SCOUT_ROWS;
    const shown = rows.length > limit ? rows.slice(0, limit) : rows;
    const hasClub = shown.length > 0 && shown[0].player.raw && shown[0].player.raw['Club'] !== undefined;
    const clubCell = (p) => hasClub
      ? `<td>${p.raw['Club'] || '<span style="color:var(--muted-2)">—</span>'}${p.raw['Nation'] ? ` <span style="color:var(--muted)">· ${p.raw['Nation']}</span>` : ''}${p.raw['Work Permit'] === 'Needed' ? ' <span style="color:var(--muted)" title="Needs a work permit for your club (by nationality)">· permit</span>' : ''}</td><td>${p.raw['Transfer Value'] || '—'}</td><td class="int-cell">${interestTagsHtml(p)}</td>`
      : '';
    const tableRows = shown.map((r, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td><strong>${r.player.info.Player}</strong></td>
        <td>${r.player.info.Age || '—'}</td>
        <td><span class="score-pill">${r.score.toFixed(1)}</span></td>
        <td>${r.potentialScore !== null ? `<span class="score-pill potential-score">${r.potentialScore.toFixed(1)}</span>` : '<span style="color:var(--muted-2)">—</span>'}</td>
        <td>${impactHtml(r.player)}</td>
        <td>${famTagHtml(r.familiarity)}</td>
        <td>${hiddenTagHtml(r)}</td>
        ${clubCell(r.player)}
      </tr>
    `).join('');
    const colCount = hasClub ? 11 : 8;
    const countLabel = rows.length > shown.length
      ? `showing top ${shown.length.toLocaleString()} of ${rows.length.toLocaleString()}`
      : `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'}`;
    const remaining = rows.length - shown.length;
    const moreButtons = remaining > 0
      ? `<div class="scout-more-row" style="display:flex;gap:8px;align-items:center;padding:8px 2px 0">
           <button type="button" class="btn btn-sm" data-more="200">Show ${Math.min(200, remaining).toLocaleString()} more</button>
           ${remaining > 400 ? `<button type="button" class="btn btn-sm" data-more="1000">Show ${Math.min(1000, remaining).toLocaleString()} more</button>` : ''}
           <span class="hint" style="margin:0">${remaining.toLocaleString()} more below - the Scouting filters above narrow the list instantly</span>
         </div>`
      : '';

    panel.innerHTML = `
      <div class="panel-head">
        <h2>${posLabel} — ${roleName}</h2>
        <span class="hint" style="margin:0">${countLabel}</span>
      </div>
      <div class="table-wrap scroll-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Age</th>
              <th class="sortable-th" data-sort-field="score">Score${sortArrow('score')}</th>
              <th class="sortable-th" data-sort-field="potential">Potential${sortArrow('potential')}</th>
              <th class="sortable-th" data-sort-field="impact" title="Match-engine fit (0-100): his attributes weighted by what they were worth in FM27's match engine (Fm-Match-Lab studies). The engine plays on attributes, not on CA - a high Impact with a modest CA or value is a bargain.">Impact${sortArrow('impact')}</th>
              <th>Familiarity</th>
              <th title="How much his availability (injury proneness, natural fitness) moves his rating">Avail.</th>
              ${hasClub ? '<th>Club · Nation</th><th>Value</th><th title="Estimated interest in joining your club on a transfer (T) and on a loan (L)">Interest</th>' : ''}
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="${colCount}">No matching players found</td></tr>`}</tbody>
        </table>
      </div>
      ${moreButtons}
    `;

    panel.querySelectorAll('[data-more]').forEach(btn => {
      btn.addEventListener('click', () => {
        scoutShown[positionCode] = limit + parseInt(btn.getAttribute('data-more'), 10);
        computeAndRender();
      });
    });

    panel.querySelectorAll('.sortable-th').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort-field');
        const current = scoutSortState[positionCode] || { field: 'score', dir: 'desc' };
        scoutSortState[positionCode] = current.field === field
          ? { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
          : { field, dir: 'desc' };
        computeAndRender();
      });
    });

    return panel;
  }

  function buildPotentialSlotPanel(rs, topN) {
    const posLabel = POSITION_SLOT_MAP[rs.slot.positionCode]
      ? POSITION_SLOT_MAP[rs.slot.positionCode].label
      : rs.slot.positionCode;
    const roleName = rs.role ? rs.role.name : '';

    const panel = document.createElement('div');
    panel.className = 'panel slot-detail-panel';

    const topPlayers = rs.ranked.slice(0, topN || 10);
    const tableRows = topPlayers.map((r, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td><strong>${r.player.info.Player}</strong></td>
        <td>${r.player.info.Age || '—'}</td>
        <td><span class="score-pill potential-score">${r.score.toFixed(1)}</span></td>
        <td>${r.currentFit.toFixed(1)}</td>
        <td>${r.ceiling !== null ? r.ceiling.toFixed(1) : '—'} ${potentialHtml(r.potential)}</td>
        <td>${famTagHtml(r.familiarity)}</td>
        <td style="color:var(--muted-2)">${r.growthDataCount}/7</td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div class="panel-head">
        <h2>${posLabel} — ${roleName}</h2>
      </div>
      <div class="table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Age</th>
              <th>Potential</th>
              <th>Current Fit</th>
              <th>Ceiling</th>
              <th>Familiarity</th>
              <th>Growth Data</th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="8">No matching players found</td></tr>'}</tbody>
        </table>
      </div>
    `;
    return panel;
  }

  // --- Player Search tab ---

  function renderPlayerSearchTab() {
    if (!squad) {
      if (el.playerSearchEmptyState) el.playerSearchEmptyState.hidden = false;
      if (el.playerSearchPanel) el.playerSearchPanel.hidden = true;
      if (el.playerOverviewPanels) el.playerOverviewPanels.innerHTML = '';
      searchedPlayer = null;
      return;
    }

    if (el.playerSearchEmptyState) el.playerSearchEmptyState.hidden = true;
    if (el.playerSearchPanel) el.playerSearchPanel.hidden = false;

    // The squad may have been re-imported since a player was selected -
    // drop the selection rather than showing a stale/detached player.
    if (searchedPlayer && !squad.players.includes(searchedPlayer)) searchedPlayer = null;

    renderPlayerSearchResults();
    renderPlayerOverview();
  }

  function renderPlayerSearchResults() {
    if (!el.playerSearchResults || !squad) return;
    const q = el.playerSearchInput ? el.playerSearchInput.value.trim().toLowerCase() : '';
    const matches = squad.players
      .filter(p => !q || p.info.Player.toLowerCase().includes(q))
      .slice(0, 15);

    el.playerSearchResults.innerHTML = '';
    if (matches.length === 0) {
      el.playerSearchResults.innerHTML = '<p class="hint">No players match.</p>';
      return;
    }

    matches.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'player-search-result' + (searchedPlayer === p ? ' active' : '');
      btn.innerHTML = `<strong>${p.info.Player}</strong><span style="color:var(--muted)">${p.info.Age || '—'} · ${p.info.Position || '—'}</span>`;
      btn.addEventListener('click', () => {
        searchedPlayer = p;
        renderPlayerSearchResults();
        renderPlayerOverview();
      });
      el.playerSearchResults.appendChild(btn);
    });
  }

  function renderPlayerOverview() {
    if (!el.playerOverviewPanels) return;
    el.playerOverviewPanels.innerHTML = '';
    if (!searchedPlayer) return;

    const p = searchedPlayer;
    const ability = typeof getStarRating === 'function' ? getStarRating(p, 'Ability') : null;
    const potential = typeof getStarRating === 'function' ? getStarRating(p, 'Potential') : null;

    const summaryPanel = document.createElement('div');
    summaryPanel.className = 'panel';
    summaryPanel.innerHTML = `
      <div class="panel-head">
        <h2>${p.info.Player}</h2>
      </div>
      <div class="player-overview-summary">
        <div><span class="label">Age</span><span class="val">${p.info.Age || '—'}</span></div>
        <div><span class="label">Position</span><span class="val">${p.info.Position || '—'}</span></div>
        <div><span class="label">Ability</span><span class="val">${potentialHtml(ability)}</span></div>
        <div><span class="label">Potential</span><span class="val">${potentialHtml(potential)}</span></div>
      </div>
    `;
    el.playerOverviewPanels.appendChild(summaryPanel);
    el.playerOverviewPanels.appendChild(buildAttributesPanel(p));
    el.playerOverviewPanels.appendChild(buildEnginePanel(p));
    el.playerOverviewPanels.appendChild(buildHiddenPanel(p));
    el.playerOverviewPanels.appendChild(buildPositionOverviewPanel(p));
  }

  function buildAttributesPanel(player) {
    const panel = document.createElement('div');
    panel.className = 'panel';

    const categories = typeof ATTRIBUTE_CATEGORIES === 'object' ? ATTRIBUTE_CATEGORIES : {};
    const sections = Object.keys(categories).map(catName => {
      const attrs = categories[catName]
        .map(name => ({ name, val: getAttributeValue(player, name) }))
        .filter(a => a.val !== null);
      if (attrs.length === 0) return '';

      const items = attrs.map(a => `
        <div class="attr-item">
          <span class="attr-name">${a.name}</span>
          <span class="attr-val">${a.val}</span>
        </div>
      `).join('');
      return `<div class="attr-category"><h3>${catName}</h3><div class="attr-grid">${items}</div></div>`;
    }).filter(Boolean).join('');

    panel.innerHTML = `
      <div class="panel-head"><h2>Attributes</h2></div>
      ${sections || '<p class="hint">No attribute columns found for this player in the import.</p>'}
    `;
    return panel;
  }

  function buildPositionOverviewPanel(player) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const options = rankOptions();

    // Only positions currently on the tactic grid - lets you narrow the survey down to "how do they fit MY
    // tactic" using the exact roles set for that slot, instead of the generic best-role-in-the-group comparison.
    const activeSlots = Object.values(grid);
    if (positionFitFilter !== 'all' && !activeSlots.some(s => s.positionCode === positionFitFilter)) {
      positionFitFilter = 'all'; // the selected slot was removed from the tactic since - fall back
    }

    const slotOptions = inPitchOrder(activeSlots, s => s.positionCode).map(slot => {
      const role = slotRole(slot);
      const selected = positionFitFilter === slot.positionCode ? ' selected' : '';
      return `<option value="${slot.positionCode}"${selected}>${posLabelOf(slot.positionCode)} — ${role.name}</option>`;
    }).join('');

    let rows, hint;
    if (positionFitFilter === 'all') {
      hint = 'The best in-possession and out-of-possession role in every position group on the pitch, highest first — regardless of what\'s currently on your tactic grid.';
      const overview = computePlayerPositionOverview(player, options);
      rows = overview.map(o => {
        if (o.score === null) {
          return `<tr><td>${o.label}</td><td colspan="5" style="color:var(--muted)">No attribute data for this position</td></tr>`;
        }
        return `
          <tr>
            <td>${o.label}</td>
            <td>${o.role.ip.name}</td>
            <td>${o.role.oop.name}</td>
            <td><span class="score-pill">${o.score.toFixed(1)}</span></td>
            <td>${o.potentialScore !== null ? `<span class="score-pill potential-score">${o.potentialScore.toFixed(1)}</span>` : '—'}</td>
            <td>${famTagHtml(o.familiarity)}</td>
          </tr>
        `;
      }).join('');
    } else {
      hint = 'Fit for the exact in- and out-of-possession roles set in this tactic slot.';
      const slot = activeSlots.find(s => s.positionCode === positionFitFilter);
      const role = slotRole(slot);
      const fitResult = calculateSlotScore(player, slot, options);
      const potentialResult = calculatePotentialScore(player, slot, options);
      rows = fitResult.score === null
        ? `<tr><td>${posLabelOf(slot.positionCode)}</td><td colspan="5" style="color:var(--muted)">No attribute data for these roles</td></tr>`
        : `
          <tr>
            <td>${posLabelOf(slot.positionCode)}</td>
            <td>${role.ip.name}</td>
            <td>${role.oop.name}</td>
            <td><span class="score-pill">${fitResult.score.toFixed(1)}</span></td>
            <td>${potentialResult.score !== null ? `<span class="score-pill potential-score">${potentialResult.score.toFixed(1)}</span>` : '—'}</td>
            <td>${famTagHtml(fitResult.familiarity)}</td>
          </tr>
        `;
    }

    panel.innerHTML = `
      <div class="panel-head">
        <h2>Position Fit</h2>
        <select id="positionFitFilterSelect">
          <option value="all"${positionFitFilter === 'all' ? ' selected' : ''}>All Positions</option>
          ${slotOptions}
        </select>
      </div>
      <p class="hint">${hint}</p>
      <div class="table-wrap">
        <table class="results-table">
          <thead><tr><th>Position</th><th>In possession</th><th>Out of possession</th><th>Fit</th><th>Potential</th><th>Familiarity</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6">No data</td></tr>'}</tbody>
        </table>
      </div>
    `;

    const select = panel.querySelector('#positionFitFilterSelect');
    if (select) {
      select.addEventListener('change', (e) => {
        positionFitFilter = e.target.value;
        renderPlayerOverview();
      });
    }

    return panel;
  }

  /** The hidden attributes and personality, and the estimates of FM27's Tactical Understanding / Player Buy-In
   * they feed - the part of a rating the visible attributes don't show. */
  function buildHiddenPanel(player) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const p = hiddenProfile(player);
    const v = vecOf(player);
    const at = (n) => { const x = v[ATTR_INDEX[attrKey(n)]]; return x === x ? x : null; };
    const num = (x) => (x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toString());
    const item = (name, val) => `<div class="attr-item"><span class="attr-name">${name}</span><span class="attr-val">${num(val)}</span></div>`;
    const pers = ['Adaptability', 'Ambition', 'Loyalty', 'Pressure', 'Professionalism', 'Sportsmanship', 'Temperament', 'Controversy']
      .map(n => item(n, getAttributeValue(player, n))).join('');
    const hid = ['Consistency', 'Important Matches', 'Injury Proneness', 'Versatility', 'Natural Fitness', 'Dirtiness', 'Determination']
      .map(n => item(n, at(n))).join('');
    const est = (label, x, tip) => `<div class="attr-item" title="${tip}"><span class="attr-name">${label}</span><span class="attr-val">${x === null ? '—' : (x * 20).toFixed(1)}</span></div>`;
    const ta = p.tacticalAbility;
    const strength = rankOptions().hidden;
    const mult = hiddenMultiplier(player, strength);
    panel.innerHTML = `
      <div class="panel-head"><h2>Hidden profile</h2><span class="hint" style="margin:0">Effect on his ratings: <strong>${mult >= 1 ? '+' : ''}${((mult - 1) * 100).toFixed(1)}%</strong> at the current "Availability" setting</span></div>
      <div class="attr-category"><h3>Personality</h3><div class="attr-grid">${pers}</div></div>
      <div class="attr-category"><h3>Hidden attributes</h3><div class="attr-grid">${hid}</div></div>
      <div class="attr-category"><h3>What the game makes of them</h3><div class="attr-grid">
        <div class="attr-item" title="The game's own Player Tactical Ability: the median of Anticipation, Decisions, Composure, Concentration and Versatility, minus 1, times 100/19 (decoded by Fm-Match-Lab, exact). It feeds his tactical familiarity, but only through the median: raising one of the five helps only if it moves the median."><span class="attr-name">Tactical ability (0-100)</span><span class="attr-val">${ta === null ? '—' : ta}</span></div>
        ${est('Availability (out of 20)', p.availability, 'Injury proneness and natural fitness: how often he is fit and sharp. The only hidden factor that moves his rating.')}
        ${est('Player buy-in (estimate, out of 20)', p.buyIn, 'Professionalism, adaptability, loyalty, temperament, determination. The game shows buy-in on its Tactical Effectiveness screen, but the match showed no effect from it.')}
      </div></div>
      <p class="hint" style="margin-top:8px">Fm-Match-Lab replayed real FM27 matches thousands of times: consistency, important matches, determination, buy-in, current ability and most personality fields made no measurable difference in a match, and Natural Fitness isn't read during one (it governs recovery between matches). So only availability moves his rating; the rest is here for information.</p>
    `;
    return panel;
  }

  /** What the match engine rewards in him: his match-engine fit and the attributes behind it (Fm-Match-Lab). */
  function buildEnginePanel(player) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const f = engineFit20(player);
    const rows = engineDrivers(player).map(d => {
      const per5 = ENGINE_PPG[d.name] !== undefined ? ENGINE_PPG[d.name] * 5 / 11 * 38 : null;
      return `<tr><td>${esc(d.name)}</td><td><strong>${d.value.toFixed(1)}</strong></td><td>${(d.weight * 100).toFixed(1)}</td>
        <td>${per5 === null ? '—' : `${per5 >= 0 ? '+' : ''}${per5.toFixed(1)}`}</td></tr>`;
    }).join('');
    panel.innerHTML = `
      <div class="panel-head"><h2>Match engine</h2><span class="hint" style="margin:0">Match-engine fit: <strong>${f === null ? '—' : (f * 5).toFixed(1)}</strong> / 100</span></div>
      <p class="hint">The attributes that moved results in FM27's own match engine (Fm-Match-Lab: ten real matches replayed 300 times per attribute). "Weight" is the xG difference per game for a whole team per point (×100); "+5 for him" is roughly what five more points on this one player would be worth over a 38-game season, in league points. Everything not listed - Passing, Technique, First Touch, Crossing, Tackling, Marking, Positioning, Decisions, Teamwork, Flair... - showed no clear effect.</p>
      <div class="table-wrap"><table class="results-table">
        <thead><tr><th>Attribute</th><th>His value</th><th>Weight</th><th title="League points over a 38-game season from +5 on this attribute for this one starter (the whole-team effect / 11)">+5 for him</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    return panel;
  }

  // --- Financial tab ---

  function renderFinancialTab() {
    if (!squad) {
      if (el.financialInfoPanel) el.financialInfoPanel.hidden = true;
      if (el.financialTableWrap) el.financialTableWrap.hidden = true;
      if (el.financialEmptyState) {
        el.financialEmptyState.hidden = false;
        el.financialEmptyState.querySelector('p').textContent = 'Import a squad CSV export to see sellable players.';
      }
      return;
    }

    if (el.financialInfoPanel) el.financialInfoPanel.hidden = false;

    const activeSlots = Object.values(grid);
    const rankedSlots = activeSlots.map(slot => {
      const role = slotRole(slot);
      const ranked = rankPlayersForSlot(slot, role, squad.players, rankOptions());
      return { slot, role, ranked };
    });

    const candidates = typeof computeSellCandidates === 'function' ? computeSellCandidates(rankedSlots, squad.players) : [];

    if (candidates.length === 0) {
      if (el.financialEmptyState) {
        el.financialEmptyState.hidden = false;
        el.financialEmptyState.querySelector('p').textContent = 'No surplus players found — everyone in your squad is a starter or backup somewhere in your tactic.';
      }
      if (el.financialTableWrap) el.financialTableWrap.hidden = true;
      return;
    }

    if (el.financialEmptyState) el.financialEmptyState.hidden = true;
    if (el.financialTableWrap) el.financialTableWrap.hidden = false;

    const rows = candidates.map(c => {
      const bf = c.bestFit;
      const posLabel = bf && POSITION_SLOT_MAP[bf.positionCode] ? POSITION_SLOT_MAP[bf.positionCode].label : (bf ? bf.positionCode : null);
      const bestFitCell = bf
        ? `${posLabel} — ${bf.role.name} <span class="score-pill" style="margin-left:6px">${bf.score.toFixed(1)}</span> ${famTagHtml(bf.familiarity)}`
        : '<span style="color:var(--muted-2)">Not ranked in any active slot</span>';
      return `
        <tr>
          <td><strong>${c.player.info.Player}</strong></td>
          <td>${c.player.info.Age || '—'}</td>
          <td>${c.player.info.Position || '—'}</td>
          <td>${c.valueRaw ? c.valueRaw : '<span style="color:var(--muted-2)">—</span>'}</td>
          <td>${bestFitCell}</td>
        </tr>
      `;
    }).join('');

    if (el.financialTable) {
      el.financialTable.innerHTML = `
        <thead>
          <tr>
            <th>Player</th>
            <th>Age</th>
            <th>Position</th>
            <th>Value</th>
            <th>Best Fit (active tactic)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      `;
    }
  }

  // --- Tactic Advisor, Team Info, Youngsters and World tabs ---

  let gameDate = null;                 // the game's "today", from the live data (null for CSV imports)
  let youngMaxAge = 21;
  let advisorResults = [];
  const worldState = { kind: 'best', position: '', nation: '', maxAge: '', rows: null, status: '', loading: false };

  function parseDmy(text) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text || '');
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
  }

  /** Months from the game's today to a dd/mm/yyyy date (null when either is unknown). */
  function monthsUntil(text) {
    const d = parseDmy(text);
    if (!d || !gameDate) return null;
    return (d - gameDate) / (30.44 * 86400000);
  }

  function emptyNote(text) {
    return `<div class="empty-state"><p>${text}</p></div>`;
  }

  function miniTable(headers, rows, emptyText) {
    return `<div class="table-wrap"><table class="results-table">
      <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('') || `<tr><td colspan="${headers.length}" style="color:var(--muted)">${emptyText || 'Nobody'}</td></tr>`}</tbody>
    </table></div>`;
  }

  function nameCell(p) {
    return `<strong>${esc(p.info.Player)}</strong>${injuryTagHtml(p)}`;
  }

  function median(values) {
    if (!values.length) return 0;
    const s = values.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /** The XI and bench for the current tactic (or the best by ability when no tactic is set up yet). */
  function squadContext() {
    if (!squad || !squad.players.length) return null;
    const options = squadOptions();
    const players = squad.players;
    const slots = Object.values(grid);
    let xi, bench, ev = null;
    if (slots.length >= 8) {
      ev = evaluateFormation(slots, players, options);
      xi = ev.assignment.filter(Boolean).map(r => r.player);
      bench = computeBench(ev.rankedSlots, ev.assignment, 9).map(b => b.player);
    } else {
      const byCa = players.slice().sort((a, b) => (b.ca || 0) - (a.ca || 0));
      xi = byCa.slice(0, 11);
      bench = byCa.slice(11, 20);
    }
    return { players, options, ev, slots, xi, bench, xiIds: new Set(xi.map(playerId)), benchIds: new Set(bench.map(playerId)) };
  }

  // --- Tactic Advisor: which formation suits this squad best? ---

  function renderTacticAdvisor() {
    const box = el.tacticsBody;
    if (!box) return;
    if (!squad || !squad.players.length) {
      box.innerHTML = emptyNote('Scan the game (or import a squad) to see which tactic suits your players best.');
      return;
    }
    const options = rankOptions();
    const hideInjured = el.hideInjuredToggle ? el.hideInjuredToggle.checked : false;
    const players = hideInjured ? squad.players.filter(p => !p.injured) : squad.players;

    const candidates = [];
    const current = Object.values(grid);
    if (current.length >= 8) candidates.push({ name: 'Your pitch tactic', source: 'current', slots: current });
    const saved = loadSavedFormations();
    Object.keys(saved).sort((a, b) => a.localeCompare(b)).forEach(name => {
      const slots = Object.values(migrateGrid(saved[name]));
      if (slots.length >= 8) candidates.push({ name, source: 'saved', slots });
    });
    PRESET_FORMATIONS.forEach(f => {
      candidates.push({ name: f.name, source: 'preset', slots: f.codes.map(code => suggestRoles(code, players, options)) });
    });

    const fitness = useTodaysFitness();
    const evalOptions = Object.assign({}, options, { fitness });       // the XI for today's match
    advisorResults = candidates.map(c => {
      const ev = evaluateFormation(c.slots, players, evalOptions);
      return { c, ev, score: c.slots.length ? ev.total / c.slots.length : 0 };
    }).sort((a, b) => b.score - a.score);

    const best = advisorResults.length ? advisorResults[0].score : 0;
    const mine = advisorResults.find(r => r.c.source === 'current');
    // One point of XI rating (0-100) is 0.2 attribute points for each of the eleven, about 0.07 points a game by the
    // studies' values - a rough guide, closest to the truth with "Ratings: Match engine".
    const ppgPerRating = 0.2 * STARTER_PPG_PER_POINT * 11;
    const vsMine = (r) => {
      if (!mine || r === mine) return '';
      const d = (r.score - mine.score) * ppgPerRating;
      return `<br><span class="muted-inline" title="Rough estimate from the XI rating once the new tactic is fully trained; until then an untrained tactic costs about 0.4 points a game">${d >= 0 ? '+' : ''}${d.toFixed(2)} pts/game vs yours</span>`;
    };
    const sourceLabel = { current: 'on your pitch', saved: 'saved formation', preset: 'preset, best roles for your squad' };
    const rows = advisorResults.map((r, i) => {
      const xi = inPitchOrder(r.ev.assignment.map((a, idx) => ({ a, slot: r.c.slots[idx] })), x => x.slot.positionCode)
        .map(x => `<div>${posLabelOf(x.slot.positionCode)} <span class="muted-inline">${slotRole(x.slot).name}</span> — ${x.a ? `<strong>${esc(x.a.player.info.Player)}</strong> <span class="score-pill">${x.a.score.toFixed(1)}</span> ${famTagHtml(x.a.familiarity)}` : '<span style="color:var(--muted)">nobody</span>'}</div>`).join('');
      const weak = r.ev.weakest ? `${posLabelOf(r.ev.weakest.slot.positionCode)} — ${esc(r.ev.weakest.player.info.Player)} (${r.ev.weakest.score.toFixed(1)})` : '—';
      return `<tr>
        <td>#${i + 1}</td>
        <td><strong>${esc(r.c.name)}</strong><br><span class="muted-inline">${sourceLabel[r.c.source]}</span></td>
        <td><span class="score-pill">${r.score.toFixed(1)}</span> <span class="muted-inline">${r.score >= best ? 'best' : `${(r.score - best).toFixed(1)}`}</span>${vsMine(r)}</td>
        <td>${weak}</td>
        <td><details><summary>XI</summary><div class="xi-list">${xi}</div></details></td>
        <td><button type="button" class="btn btn-sm" data-use="${i}">Use on pitch</button></td>
      </tr>`;
    }).join('');

    box.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>Tactic Advisor</h2></div>
        <p class="hint">Every formation scored by the best XI your squad can field in it (average rating of the eleven, with availability and position familiarity counted). Presets use the in- and out-of-possession roles that suit your squad best; your pitch tactic and saved formations keep the roles you chose. Injured players are ${hideInjured ? 'left out' : 'included (tick "Hide injured players" to leave them out)'}.${fitness ? ' Today\'s condition and match sharpness are counted.' : ''}</p>
        <p class="hint"><strong>Before switching</strong> (Fm-Match-Lab, FM27's own engine): a tactic your players haven't trained costs about 0.4 points a game, and low against high familiarity was worth about 0.5 - as much as +7 Pace for the whole squad. Training it to about 75 in every area recovers that; more gains nothing, and training counts twice as much as playing matches with it. So a small gain on paper isn't worth a switch mid-season. In the same studies every installed FM preset style did worse than a tactic suited to the squad, and the defensive ones (Park the Bus, Catenaccio) were by far the worst.</p>
        <div class="table-wrap"><table class="results-table">
          <thead><tr><th></th><th>Formation</th><th>XI rating</th><th>Weakest link</th><th>Lineup</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;

    box.querySelectorAll('[data-use]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = advisorResults[parseInt(btn.getAttribute('data-use'), 10)];
        if (!r) return;
        const g = {};
        r.c.slots.forEach(s => { g[s.positionCode] = Object.assign({}, s); });
        grid = g;
        activePosCode = null;
        if (el.editor) el.editor.hidden = true;
        switchTab('tacticalFit');
        computeAndRender();
      });
    });
  }

  // --- Team Info: what the match engine says about this squad (Fm-Match-Lab) ---

  const SEASON_GAMES = 38;
  const ENGINE_TOP = ['Pace', 'Acceleration', 'Jumping Reach', 'Stamina', 'Anticipation', 'Dribbling', 'Concentration'];

  function engineInsightsHtml(ctx) {
    const pts = (ppg) => (ppg * SEASON_GAMES).toFixed(1);
    const attrOf = (p, n) => { const x = vecOf(p)[ATTR_INDEX[attrKey(n)]]; return x === x ? x : null; };

    // 1. starters out of position
    let posBlock;
    if (!ctx.ev) {
      posBlock = '<p class="hint">Set up your tactic on the pitch (8+ positions) to check your XI.</p>';
    } else {
      const rows = [];
      ctx.ev.assignment.forEach((r, i) => {
        if (!r || !r.familiarity || r.familiarity.cost20 === undefined || r.familiarity.rating >= 20) return;
        const ppg = r.familiarity.cost20 * STARTER_PPG_PER_POINT;
        rows.push({ r, slot: ctx.slots[i], ppg });
      });
      rows.sort((a, b) => b.ppg - a.ppg);
      const total = rows.reduce((s, x) => s + x.ppg, 0);
      posBlock = `<p class="hint">Starters below Natural in their slot. In the studies, capping a team's starters at 15 cost 0.26 points a game and at 10 cost 0.85; this is that cost per player (a rough guide).</p>
        ${miniTable(['Slot', 'Player', 'Rating', 'Cost / season'], rows.map(x => `<tr><td>${posLabelOf(x.slot.positionCode)}</td><td>${nameCell(x.r.player)}</td><td>${famTagHtml(x.r.familiarity)} ${x.r.familiarity.rating}/20</td><td>${x.ppg < 0.0005 ? 'tiny' : `≈ ${pts(x.ppg)} pts`}</td></tr>`), 'Everyone in your XI plays a natural position')}
        ${rows.length ? `<p class="hint" style="margin-top:6px">All together: ≈ ${pts(total)} league points over a season.</p>` : ''}`;
    }

    // 2. the XI on the attributes the engine rewards most
    const xi = ctx.xi;
    const attrRows = ENGINE_TOP.map(n => {
      const vals = xi.map(p => ({ p, v: attrOf(p, n) })).filter(x => x.v !== null);
      if (!vals.length) return '';
      const avg = vals.reduce((s, x) => s + x.v, 0) / vals.length;
      const low = vals.reduce((a, b) => (b.v < a.v ? b : a));
      const perPt = ENGINE_PPG[n] || 0;
      return `<tr><td>${n}</td><td><strong>${avg.toFixed(1)}</strong></td><td>${esc(low.p.info.Player)} <span class="muted-inline">${low.v.toFixed(0)}</span></td>
        <td>${pts(perPt * 5)}</td></tr>`;
    }).join('');
    const xiImpact = xi.map(engineFit20).filter(x => x !== null);
    const impactAvg = xiImpact.length ? xiImpact.reduce((a, b) => a + b, 0) / xiImpact.length * 5 : null;

    // 3. the goalkeeper's kicking
    let gkNote = '';
    const gkSlot = ctx.ev ? ctx.ev.assignment.find((r, i) => r && ctx.slots[i].positionCode === 'GK') : null;
    const gk = gkSlot ? gkSlot.player : null;
    const kick = gk ? attrOf(gk, 'Kicking') : null;
    if (kick !== null && kick >= 15) {
      gkNote = `<p class="hint" style="margin-top:6px"><strong>${esc(gk.info.Player)}</strong> has Kicking ${kick.toFixed(0)}. Goalkeeper Kicking was the one attribute with a clearly negative effect (−0.12 xG difference per +5, with real squads only): long kicks may skip the build-up a tactic relies on. If you play out from the back, short distribution is worth a try.</p>`;
    }

    const lever = (what, size) => `<tr><td>${what}</td><td>${size}</td></tr>`;
    return `
      <div class="panel">
        <div class="panel-head"><h2>What the match engine rewards</h2><span class="hint" style="margin:0">from <a href="https://github.com/caiograco289/Fm-Match-Lab" target="_blank" rel="noopener">Fm-Match-Lab</a>: real FM27 matches replayed on the game's own engine, ~190,000 times</span></div>
        <div class="info-grid">
          <div><h3>Out of position in your XI</h3>${posBlock}</div>
          <div><h3>Your XI on the top attributes</h3>
            <p class="hint">Average of your XI${impactAvg !== null ? ` (match-engine fit ${impactAvg.toFixed(1)})` : ''}, its weakest starter, and what +5 on that attribute for the whole XI was worth over a season.</p>
            ${miniTable(['Attribute', 'XI avg', 'Weakest', '+5 for XI (pts/season)'], attrRows ? [attrRows] : [], 'No attribute data')}
            ${gkNote}
          </div>
        </div>
        <h3 style="margin-top:12px">The biggest levers, measured</h3>
        ${miniTable(['What', 'Effect in the studies'], [
          lever('Match sharpness / condition', 'sharpness 50%: −1.0 pts a game; 75%: −0.37. Condition 80%: −0.8; 90%: −0.28. Rotate and keep players sharp - it outweighs any tactical tweak'),
          lever('Playing people in their positions', 'starters capped at 15: −0.26 pts a game; at 10: −0.85'),
          lever('Tactical familiarity', 'untrained: about −0.4 pts a game; trained to about 75 in each area: +0.2, and no more after that. Training counts twice as much as match exposure'),
          lever('In-match management', 'letting the AI run the match instead of the assistant: −0.56 pts a game'),
          lever('Team cohesion', 'lowest to highest: +0.32 pts a game'),
          lever('Mentality', 'one step more attacking: −0.26 xG difference, no gain in points'),
          lever('Tactic', 'every installed preset did worse than a tactic suited to the squad; Park the Bus (−0.94 pts a game) and Catenaccio (−0.60) were the worst'),
          lever('No measurable effect', 'current ability, reputation, height, weight, buy-in, morale (small), most personality fields, most single team instructions'),
        ])}
        <p class="hint" style="margin-top:6px">All from one club's matches (a promoted Premier League side against mostly stronger teams); a dominant team may see different sizes. Season figures are rough: per-game effects × ${SEASON_GAMES}.</p>
      </div>`;
  }

  // --- Team Info: the squad at a glance ---

  function renderTeamInfo() {
    const box = el.teamInfoBody;
    if (!box) return;
    const ctx = squadContext();
    if (!ctx) {
      box.innerHTML = emptyNote('Scan the game (or import a squad) to see your team at a glance.');
      return;
    }
    const { players, xiIds, benchIds } = ctx;
    const idOf = playerId;
    const byCa = players.slice().sort((a, b) => (b.ca || 0) - (a.ca || 0));
    const starIds = new Set(byCa.slice(0, 8).map(idOf));
    const avg = (arr, f) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);
    const matchday = (p) => xiIds.has(idOf(p)) || benchIds.has(idOf(p));
    const ownPlayers = players.filter(p => !p.raw['On Loan From']);
    const injured = players.filter(p => p.injured);
    const expiring = players.filter(p => { const m = monthsUntil(p.expires); return m !== null && m <= 12; });
    const wages = players.reduce((s, p) => s + (p.wageNum || 0), 0);

    const stars = byCa.slice(0, 6);
    const prospects = players.filter(p => (p.info.Age || 99) <= 21).sort((a, b) => (b.pa || 0) - (a.pa || 0)).slice(0, 6);
    const loanOut = ownPlayers.filter(p => !matchday(p) && (p.info.Age || 99) <= 23).sort((a, b) => (b.pa || 0) - (a.pa || 0)).slice(0, 8);
    const renew = ownPlayers.filter(p => (matchday(p) || starIds.has(idOf(p))) && monthsUntil(p.expires) !== null && monthsUntil(p.expires) <= 12)
      .sort((a, b) => monthsUntil(a.expires) - monthsUntil(b.expires)).slice(0, 8);
    const surplus = ownPlayers.filter(p => !matchday(p) && (p.info.Age || 0) >= 24)
      .sort((a, b) => (b.valueNum || 0) - (a.valueNum || 0)).slice(0, 6);

    const card = (label, val, sub) => `<div class="depth-summary-card"><span class="label">${label}</span><span class="val">${val}</span><span class="sub">${sub || ''}</span></div>`;
    const money = (v) => (v >= 1e6 ? '£' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : (v >= 1e3 ? '£' + Math.round(v / 1e3) + 'K' : '£' + v));
    const exp = (p) => {
      const m = monthsUntil(p.expires);
      return `${esc(p.expires || '—')}${m !== null ? ` <span class="muted-inline">(${m < 1 ? 'under a month' : Math.round(m) + ' mo'})</span>` : ''}`;
    };

    box.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>Team Info</h2></div>
        <div class="depth-summary-grid">
          ${card('Squad', players.length, 'players on the books')}
          ${card('Average age', avg(players, p => p.info.Age || 0).toFixed(1), 'whole squad')}
          ${card('Average ability', avg(byCa.slice(0, 18), p => p.ca || 0).toFixed(0), 'best 18 (CA)')}
          ${card('Injured', injured.length, injured.length ? 'see below' : 'everyone fit')}
          ${card('Contracts ending', expiring.length, 'within 12 months')}
          ${card('Wage bill', wages ? money(wages) + '/wk' : '—', 'whole squad')}
        </div>
      </div>
      ${engineInsightsHtml(ctx)}
      <div class="info-grid">
        <div class="panel"><div class="panel-head"><h2>The stars</h2></div>
          ${miniTable(['Player', 'Age', 'Position', 'CA', 'PA'], stars.map(p => `<tr><td>${nameCell(p)}</td><td>${p.info.Age || '—'}</td><td>${esc(p.info.Position)}</td><td>${p.ca || '—'}</td><td>${p.pa || '—'}</td></tr>`))}
        </div>
        <div class="panel"><div class="panel-head"><h2>Brightest prospects</h2></div>
          ${miniTable(['Player', 'Age', 'Position', 'CA', 'PA'], prospects.map(p => `<tr><td>${nameCell(p)}</td><td>${p.info.Age || '—'}</td><td>${esc(p.info.Position)}</td><td>${p.ca || '—'}</td><td><strong>${p.pa || '—'}</strong></td></tr>`), 'No one aged 21 or under')}
        </div>
        <div class="panel"><div class="panel-head"><h2>Loan out for minutes</h2></div>
          <p class="hint">Young players outside your XI and bench - they need games more than they need the bench.</p>
          ${miniTable(['Player', 'Age', 'Position', 'CA', 'PA'], loanOut.map(p => `<tr><td>${nameCell(p)}</td><td>${p.info.Age || '—'}</td><td>${esc(p.info.Position)}</td><td>${p.ca || '—'}</td><td>${p.pa || '—'}</td></tr>`), 'Nobody young is out of the matchday squad')}
        </div>
        <div class="panel"><div class="panel-head"><h2>Offer a new contract</h2></div>
          <p class="hint">Key players (XI, bench or top eight by ability) whose deals end within a year.</p>
          ${miniTable(['Player', 'Age', 'CA', 'Contract ends', 'Wage'], renew.map(p => `<tr><td>${nameCell(p)}</td><td>${p.info.Age || '—'}</td><td>${p.ca || '—'}</td><td>${exp(p)}</td><td>${p.wageNum ? money(p.wageNum) + '/wk' : '—'}</td></tr>`), 'No key contracts ending soon')}
        </div>
        <div class="panel"><div class="panel-head"><h2>Surplus - could be sold</h2></div>
          <p class="hint">Players 24+ outside your XI and bench, most valuable first.</p>
          ${miniTable(['Player', 'Age', 'Position', 'CA', 'Value'], surplus.map(p => `<tr><td>${nameCell(p)}</td><td>${p.info.Age || '—'}</td><td>${esc(p.info.Position)}</td><td>${p.ca || '—'}</td><td>${p.valueNum ? money(p.valueNum) : '—'}</td></tr>`), 'No surplus players')}
        </div>
        <div class="panel"><div class="panel-head"><h2>Injured now</h2></div>
          ${miniTable(['Player', 'Position', 'Injury'], injured.map(p => `<tr><td>${nameCell(p)}</td><td>${esc(p.info.Position)}</td><td>${esc(p.injury || 'Injured')}</td></tr>`), 'Nobody injured (first team)')}
        </div>
      </div>`;
  }

  // --- Youngsters: who is worth the effort ---

  function renderYoungsters() {
    const box = el.youngstersBody;
    if (!box) return;
    const ctx = squadContext();
    if (!ctx) {
      box.innerHTML = emptyNote('Scan the game (or import a squad) to see your youngsters.');
      return;
    }
    const { players, options } = ctx;
    const top3 = players.slice().sort((a, b) => (b.ca || 0) - (a.ca || 0)).slice(0, 3);
    const starCA = top3.length ? top3.reduce((s, p) => s + (p.ca || 0), 0) / top3.length : 0;
    const starterCA = median(ctx.xi.map(p => p.ca || 0));
    const youths = players.filter(p => (p.info.Age || 99) <= youngMaxAge).sort((a, b) => (b.pa || 0) - (a.pa || 0));

    const rows = youths.map(p => {
      const ov = computePlayerPositionOverview(p, options)[0];
      const tags = [];
      if ((p.info.Age || 99) <= 19 && (p.pa || 0) >= Math.max(starCA + 10, 150)) tags.push(['Wonderkid', 'wonder']);
      else if ((p.pa || 0) >= starCA + 5) tags.push(['Future star', 'star']);
      else if ((p.pa || 0) >= starterCA) tags.push(['Future starter', 'starter']);
      else if ((p.pa || 0) >= starterCA - 15) tags.push(['Squad player', 'prospect']);
      else tags.push(['Unlikely to reach your level', 'low']);
      if ((p.ca || 0) >= starterCA - 5) tags.push(['Ready now', 'ready']);
      const g = growthProfile(p);
      return `<tr>
        <td>${nameCell(p)}</td>
        <td>${p.info.Age || '—'}</td>
        <td>${esc(p.info.Position)}</td>
        <td>${p.ca || '—'}</td>
        <td><strong>${p.pa || '—'}</strong></td>
        <td>${ov && ov.score !== null ? `${ov.role.ip.name} <span class="muted-inline">/ ${ov.role.oop.name}</span>` : '—'}</td>
        <td>${ov && ov.score !== null ? `<span class="score-pill">${ov.score.toFixed(1)}</span>` : '—'}</td>
        <td>${ov && ov.potentialScore !== null ? `<span class="score-pill potential-score">${ov.potentialScore.toFixed(1)}</span>` : '—'}</td>
        <td title="Average of determination, ambition, professionalism, adaptability, consistency, important matches, versatility (0-20)">${(g.factor * 20).toFixed(0)}</td>
        <td>${tags.map(t => `<span class="tag tag-${t[1]}">${t[0]}</span>`).join(' ')}</td>
      </tr>`;
    }).join('');

    // The future XI: the same tactic filled by potential, from the youngsters only.
    const slots = Object.values(grid);
    let futureHtml = '';
    if (slots.length) {
      const ranked = slots.map(slot => ({
        slot, role: slotRole(slot),
        ranked: rankPlayersForPotential(slot, null, youths, options),
      }));
      const assignment = greedyBestXI(ranked);
      const frows = inPitchOrder(ranked.map((rs, i) => ({ rs, a: assignment[i] })), x => x.rs.slot.positionCode).map(({ rs, a }) => `<tr>
        <td><strong>${posLabelOf(rs.slot.positionCode)}</strong></td>
        <td>${rs.role.name}</td>
        <td>${a ? `<strong>${esc(a.player.info.Player)}</strong>` : '<span style="color:var(--muted)">no youngster for this slot</span>'}</td>
        <td>${a ? (a.player.info.Age || '—') : ''}</td>
        <td>${a ? `<span class="score-pill potential-score">${a.score.toFixed(1)}</span>` : ''}</td>
        <td>${a ? a.currentFit.toFixed(1) : ''}</td>
        <td>${a ? famTagHtml(a.familiarity) : ''}</td>
      </tr>`).join('');
      futureHtml = `<div class="panel">
        <div class="panel-head"><h2>Future XI from the youngsters</h2></div>
        <p class="hint">Your tactic filled by potential, using only the players shown above (aged ${youngMaxAge} or under): how good they could become in each slot, and where they are now.</p>
        ${miniTable(['Position', 'Roles', 'Player', 'Age', 'Potential', 'Now', 'Familiarity'], [frows])}
      </div>`;
    }

    box.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h2>Youngsters</h2>
          <label class="filter-toggle" style="margin:0">Aged up to
            <select id="youngMaxAgeSelect">
              ${[19, 21, 23].map(a => `<option value="${a}"${a === youngMaxAge ? ' selected' : ''}>${a}</option>`).join('')}
            </select>
          </label>
        </div>
        <p class="hint">Who is worth the effort, and how good they could become. <strong>Wonderkid</strong>: 19 or under with a potential well above your best players; <strong>Future star</strong>: potential above your top three; <strong>Future starter</strong>: potential at your XI's level. Your XI's median ability is ${starterCA.toFixed(0)}, your top three average ${starCA.toFixed(0)}.</p>
        <div class="table-wrap"><table class="results-table">
          <thead><tr><th>Player</th><th>Age</th><th>Position</th><th>CA</th><th>PA</th><th>Best roles</th><th>Now</th><th>Potential</th><th>Growth</th><th>Verdict</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="10" style="color:var(--muted)">No players this young</td></tr>'}</tbody>
        </table></div>
      </div>
      ${futureHtml}`;

    const sel = box.querySelector('#youngMaxAgeSelect');
    if (sel) sel.addEventListener('change', () => { youngMaxAge = parseInt(sel.value, 10); renderYoungsters(); });
  }

  // --- World: the best players and the next generation, from the whole game database ---

  const WORLD_POSITIONS = [['', 'Any position'], ['GK', 'GK'], ['DL', 'D (L)'], ['DC', 'D (C)'], ['DR', 'D (R)'], ['WBL', 'WB (L)'], ['WBR', 'WB (R)'],
    ['DM', 'DM'], ['ML', 'M (L)'], ['MC', 'M (C)'], ['MR', 'M (R)'], ['AML', 'AM (L)'], ['AMC', 'AM (C)'], ['AMR', 'AM (R)'], ['ST', 'ST']];

  function worldLoad() {
    const live = window.FM26Live;
    if (!live || worldState.loading) return;
    worldState.loading = true;
    worldState.status = 'Reading the database…';
    renderWorld();
    live.fetchTop({
      kind: worldState.kind, position: worldState.position, nation: worldState.nation,
      maxAge: worldState.kind === 'nextgen' ? (worldState.maxAge || 21) : worldState.maxAge, limit: 100,
    }).then(players => {
      worldState.rows = players;
      worldState.status = `${players.length} players`;
    }).catch(e => {
      worldState.status = 'Could not load: ' + e.message;
    }).finally(() => {
      worldState.loading = false;
      if (currentTab === 'world') renderWorld();
    });
  }

  function renderWorld() {
    const box = el.worldBody;
    if (!box) return;
    if (!window.FM26Live) {
      box.innerHTML = emptyNote('The world lists read the whole game database, so they only work in the live app (FM27Plus.exe with the game open).');
      return;
    }
    const options = rankOptions();
    const rows = (worldState.rows || []).map((p, i) => {
      const ov = computePlayerPositionOverview(p, options)[0];
      return `<tr>
        <td>#${i + 1}</td>
        <td><strong>${esc(p.info.Player)}</strong></td>
        <td>${p.info.Age || '—'}</td>
        <td>${esc(p.raw['Club'] || '—')}</td>
        <td>${esc(p.raw['Nation'] || '')}</td>
        <td>${esc(p.info.Position)}</td>
        <td>${p.ca || '—'}</td>
        <td><strong>${p.pa || '—'}</strong></td>
        <td>${ov && ov.score !== null ? `${ov.role.ip.name} <span class="muted-inline">/ ${ov.role.oop.name}</span> <span class="score-pill">${ov.score.toFixed(1)}</span>` : '—'}</td>
        <td>${impactHtml(p)}</td>
        <td>${esc(p.raw['Transfer Value'] || '—')}</td>
      </tr>`;
    }).join('');

    box.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>World</h2></div>
        <div class="scouting-filters" style="margin:0 0 10px;padding:0;border:0;background:none">
          <div class="form-group-inline"><label for="worldKind">List</label>
            <select id="worldKind">
              <option value="best"${worldState.kind === 'best' ? ' selected' : ''}>World's best players (by ability)</option>
              <option value="nextgen"${worldState.kind === 'nextgen' ? ' selected' : ''}>Next gen (best young potentials)</option>
            </select></div>
          <div class="form-group-inline"><label for="worldPosition">Position</label>
            <select id="worldPosition">${WORLD_POSITIONS.map(([v, l]) => `<option value="${v}"${v === worldState.position ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="form-group-inline"><label for="worldMaxAge">Max age</label>
            <input type="number" id="worldMaxAge" min="14" max="45" value="${worldState.maxAge}" placeholder="${worldState.kind === 'nextgen' ? '21' : 'Any'}"></div>
          <div class="form-group-inline"><label for="worldNation">Nation</label>
            <input type="text" id="worldNation" value="${esc(worldState.nation)}" placeholder="Any"></div>
          <button type="button" class="btn btn-sm btn-primary" id="worldLoadBtn"${worldState.loading ? ' disabled' : ''}>Load</button>
          <span class="hint" style="margin:0">${esc(worldState.status)}</span>
        </div>
        <div class="table-wrap scroll-table-wrap"><table class="results-table">
          <thead><tr><th>#</th><th>Player</th><th>Age</th><th>Club</th><th>Nation</th><th>Position</th><th>CA</th><th>PA</th><th>Best roles</th><th title="Match-engine fit (0-100): attributes weighted by what they were worth in FM27 matches (Fm-Match-Lab)">Impact</th><th>Value</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="11" style="color:var(--muted)">Press Load.</td></tr>'}</tbody>
        </table></div>
      </div>`;

    const read = () => {
      worldState.kind = box.querySelector('#worldKind').value;
      worldState.position = box.querySelector('#worldPosition').value;
      worldState.maxAge = box.querySelector('#worldMaxAge').value.trim();
      worldState.nation = box.querySelector('#worldNation').value.trim();
    };
    box.querySelector('#worldLoadBtn').addEventListener('click', () => { read(); worldLoad(); });
    box.querySelector('#worldKind').addEventListener('change', () => { read(); worldLoad(); });
    box.querySelector('#worldPosition').addEventListener('change', () => { read(); worldLoad(); });
    box.querySelector('#worldNation').addEventListener('keydown', (e) => { if (e.key === 'Enter') { read(); worldLoad(); } });
  }

  function switchTab(tabName) {
    currentTab = tabName;

    const tabs = {
      squadDepth: { btn: el.tabBtnSquadDepth, panel: el.tabSquadDepth },
      tacticalFit: { btn: el.tabBtnTacticalFit, panel: el.tabTacticalFit },
      tactics: { btn: el.tabBtnTactics, panel: el.tabTactics },
      teamInfo: { btn: el.tabBtnTeamInfo, panel: el.tabTeamInfo },
      youngsters: { btn: el.tabBtnYoungsters, panel: el.tabYoungsters },
      potential: { btn: el.tabBtnPotential, panel: el.tabPotential },
      playerSearch: { btn: el.tabBtnPlayerSearch, panel: el.tabPlayerSearch },
      financial: { btn: el.tabBtnFinancial, panel: el.tabFinancial },
      scouting: { btn: el.tabBtnScouting, panel: el.tabScouting },
      world: { btn: el.tabBtnWorld, panel: el.tabWorld },
    };

    Object.keys(tabs).forEach(name => {
      const t = tabs[name];
      if (!t.btn || !t.panel) return;
      const isActive = name === tabName;
      t.btn.classList.toggle('active', isActive);
      t.btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      t.panel.hidden = !isActive;
    });

    updateInjuredToggle();
    updateFitnessToggle();
    if (tabName === 'scouting' && scoutStale) rankScoutingSoon();
    if (tabName === 'world' && window.FM26Live && worldState.rows === null && !worldState.loading) worldLoad();
    renderExtraTab();
  }

  // Ranking a big pool takes a few seconds: say so first, then do it (the timeout lets the message paint).
  function rankScoutingSoon() {
    if (el.scoutingPanels && scoutSquad) {
      el.scoutingPanels.innerHTML = `<div class="panel"><p class="hint" style="margin:0">Ranking ${scoutSquad.players.length.toLocaleString()} players against your tactic…</p></div>`;
    }
    setTimeout(computeAndRender, 40);
  }

  function computeAndRenderLater() {
    renderPitchGrid();
    rankScoutingSoon();
  }

  function setupEventListeners() {
    if (el.tabBtnSquadDepth) el.tabBtnSquadDepth.addEventListener('click', () => switchTab('squadDepth'));
    if (el.tabBtnTacticalFit) el.tabBtnTacticalFit.addEventListener('click', () => switchTab('tacticalFit'));
    if (el.tabBtnPotential) el.tabBtnPotential.addEventListener('click', () => switchTab('potential'));
    if (el.tabBtnPlayerSearch) el.tabBtnPlayerSearch.addEventListener('click', () => switchTab('playerSearch'));
    if (el.tabBtnFinancial) el.tabBtnFinancial.addEventListener('click', () => switchTab('financial'));
    if (el.tabBtnScouting) el.tabBtnScouting.addEventListener('click', () => switchTab('scouting'));
    if (el.tabBtnTactics) el.tabBtnTactics.addEventListener('click', () => switchTab('tactics'));
    if (el.tabBtnTeamInfo) el.tabBtnTeamInfo.addEventListener('click', () => switchTab('teamInfo'));
    if (el.tabBtnYoungsters) el.tabBtnYoungsters.addEventListener('click', () => switchTab('youngsters'));
    if (el.tabBtnWorld) el.tabBtnWorld.addEventListener('click', () => switchTab('world'));
    if (el.autoRolesBtn) el.autoRolesBtn.addEventListener('click', autoPickRoles);
    if (el.hiddenSelect) {
      try { const saved = localStorage.getItem('fm27plus.hidden'); if (saved && HIDDEN_STRENGTH[saved] !== undefined) el.hiddenSelect.value = saved; } catch (e) { /* storage unavailable */ }
      el.hiddenSelect.addEventListener('change', () => {
        try { localStorage.setItem('fm27plus.hidden', el.hiddenSelect.value); } catch (e) { /* storage unavailable */ }
        computeAndRender();
      });
    }
    if (el.ratingModelSelect) {
      try { const saved = localStorage.getItem('fm27plus.model'); if (saved && RATING_MODELS[saved] !== undefined) el.ratingModelSelect.value = saved; } catch (e) { /* storage unavailable */ }
      el.ratingModelSelect.addEventListener('change', () => {
        try { localStorage.setItem('fm27plus.model', el.ratingModelSelect.value); } catch (e) { /* storage unavailable */ }
        computeAndRender();
      });
    }

    if (el.playerSearchInput) {
      el.playerSearchInput.addEventListener('input', () => renderPlayerSearchResults());
    }

    if (el.clearTacticBtn) {
      el.clearTacticBtn.addEventListener('click', () => {
        grid = {};
        activePosCode = null;
        if (el.editor) el.editor.hidden = true;
        computeAndRender();
      });
    }

    if (el.saveFormationBtn) el.saveFormationBtn.addEventListener('click', saveCurrentFormation);
    if (el.formationNameInput) {
      el.formationNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveCurrentFormation();
      });
    }
    if (el.loadFormationBtn) el.loadFormationBtn.addEventListener('click', loadSelectedFormation);
    if (el.deleteFormationBtn) el.deleteFormationBtn.addEventListener('click', deleteSelectedFormation);

    if (el.editorRole) {
      el.editorRole.addEventListener('change', (e) => {
        if (activePosCode && grid[activePosCode]) {
          grid[activePosCode].ipRoleId = e.target.value;
          updateEditorHint(grid[activePosCode]);
          computeAndRender();
        }
      });
    }

    if (el.editorOopRole) {
      el.editorOopRole.addEventListener('change', (e) => {
        if (activePosCode && grid[activePosCode]) {
          grid[activePosCode].oopRoleId = e.target.value;
          updateEditorHint(grid[activePosCode]);
          computeAndRender();
        }
      });
    }

    if (el.removeSlotBtn) {
      el.removeSlotBtn.addEventListener('click', () => {
        if (activePosCode && grid[activePosCode]) {
          delete grid[activePosCode];
          activePosCode = null;
          if (el.editor) el.editor.hidden = true;
          computeAndRender();
        }
      });
    }

    if (el.relatedOnlyToggle) {
      el.relatedOnlyToggle.addEventListener('change', () => computeAndRender());
    }

    if (el.potentialToggle) {
      el.potentialToggle.addEventListener('change', () => computeAndRender());
    }

    if (el.hideInjuredToggle) {
      el.hideInjuredToggle.addEventListener('change', () => computeAndRender());
    }

    if (el.fitnessToggle) {
      try { el.fitnessToggle.checked = localStorage.getItem('fm27plus.fitness') === '1'; } catch (e) { /* storage unavailable */ }
      el.fitnessToggle.addEventListener('change', () => {
        try { localStorage.setItem('fm27plus.fitness', el.fitnessToggle.checked ? '1' : '0'); } catch (e) { /* storage unavailable */ }
        computeAndRender();
      });
    }

    [el.scoutSearchInput, el.scoutMaxAgeInput, el.scoutMinScoreInput, el.scoutMinPotentialInput].forEach(input => {
      if (input) input.addEventListener('input', () => computeAndRender());
    });
    if (el.scoutClearFiltersBtn) {
      el.scoutClearFiltersBtn.addEventListener('click', () => {
        if (el.scoutSearchInput) el.scoutSearchInput.value = '';
        if (el.scoutMaxAgeInput) el.scoutMaxAgeInput.value = '';
        if (el.scoutMinScoreInput) el.scoutMinScoreInput.value = '';
        if (el.scoutMinPotentialInput) el.scoutMinPotentialInput.value = '';
        computeAndRender();
      });
    }

    if (el.csvInput) {
      el.csvInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleSquadFile(e.target.files[0]);
      });
    }

    if (el.fileDrop) {
      el.fileDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.fileDrop.classList.add('drag-over');
      });
      el.fileDrop.addEventListener('dragleave', () => el.fileDrop.classList.remove('drag-over'));
      el.fileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        el.fileDrop.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleSquadFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (el.scoutCsvInput) {
      el.scoutCsvInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleScoutFile(e.target.files[0]);
      });
    }

    if (el.scoutFileDrop) {
      el.scoutFileDrop.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.scoutFileDrop.classList.add('drag-over');
      });
      el.scoutFileDrop.addEventListener('dragleave', () => el.scoutFileDrop.classList.remove('drag-over'));
      el.scoutFileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        el.scoutFileDrop.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleScoutFile(e.dataTransfer.files[0]);
        }
      });
    }
  }

  function handleSquadFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof parseSquadCsv === 'function') {
        squad = parseSquadCsv(e.target.result);
        if (el.importStatus) {
          el.importStatus.textContent = `Loaded ${squad.players.length} players (${file.name})`;
        }
        computeAndRender();
      }
    };
    reader.readAsText(file);
  }

  function handleScoutFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof parseSquadCsv === 'function') {
        scoutSquad = parseSquadCsv(e.target.result);
        if (el.scoutImportStatus) {
          el.scoutImportStatus.textContent = `Loaded ${scoutSquad.players.length} scouted players (${file.name})`;
        }
        computeAndRender();
      }
    };
    reader.readAsText(file);
  }

  function setDefault433() {
    grid = {};
    ['GK', 'DR', 'DCR', 'DCL', 'DL', 'DMC', 'MCR', 'MCL', 'AMR', 'AML', 'STC'].forEach(code => {
      grid[code] = Object.assign({ positionCode: code }, defaultRoleIds(code));
    });
  }

  // Entry points for memory-bridge.js (live data straight from FM's memory).
  window.FM26App = {
    setSquad(players, statusText, info) {
      if (info && info.game_date) gameDate = parseDmy(info.game_date);
      squad = { players };
      if (el.importStatus) el.importStatus.textContent = statusText || '';
      computeAndRender();
    },
    setScoutPool(players, statusText) {
      scoutSquad = players ? { players } : null;
      scoutVersion++;
      scoutCache = null;
      scoutShown = {};
      if (el.scoutImportStatus) el.scoutImportStatus.textContent = statusText || '';
      if (currentTab === 'scouting' && scoutSquad && Object.keys(grid).length) {
        computeAndRenderLater();         // a big pool is ranked right now: say so first
      } else {
        computeAndRender();
      }
    },
    setEmptyMessages(squadText, scoutText) {
      if (squadText && el.emptyState) el.emptyState.querySelector('p').textContent = squadText;
      if (scoutText && el.scoutingEmptyState) el.scoutingEmptyState.querySelector('p').textContent = scoutText;
    },
    switchTab,
    rerender: computeAndRender,
  };

  function init() {
    setupEventListeners();
    setDefault433();
    refreshSavedFormationsSelect();
    computeAndRender();
    document.dispatchEvent(new Event('fm26app-ready'));
  }

  document.addEventListener('DOMContentLoaded', init);

})();