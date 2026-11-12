/**
 * Live-data bridge for the FM27 Plus app (reads FM27, or FM26 if that's what is running).
 *
 * When the page is served by FM27Plus.exe (server.py), this connects to its
 * local API, which reads the player database straight out of Football
 * Manager's memory. It converts those players into exactly the shape the
 * CSV parser produces, so every tab (Squad Depth, Tactical Fit, Potential,
 * Player Search, Financial, Scouting) works unchanged - just without the
 * export step. Opened as a plain file, none of this activates.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let meta = null;
  let scanning = false;
  let lastInfo = null;
  let game = 'FM';                 // 'FM27' / 'FM26', reported by the server
  let retryTimer = null;           // pending automatic rescan
  let retryDelay = 4000;
  let poolLoaded = false;          // has the scouting pool been loaded at least once?

  function setGame(g) {
    if (!g || g === game) return;
    game = g;
    document.title = `${game} Plus — Tactical Fit & Squad Depth`;
    const h = document.getElementById('liveTitle');
    if (h) h.textContent = `1. ${game} Live Data`;
  }

  const LOST_CONTACT = 'Lost contact with the FM27 Plus app (it is no longer running in the background). '
    + 'Close this window and start FM27Plus.exe again.';

  async function api(path) {
    let res;
    try {
      res = await fetch(path, { cache: 'no-store' });
    } catch (e) {
      throw new Error(LOST_CONTACT);        // the request never got an answer: the app itself is gone
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error((body && body.error) || res.statusText);
    return body;
  }

  // --- keeping the app alive ------------------------------------------------
  // The app quits once its window has gone. It learns that from a goodbye sent as the page closes,
  // so a slow heartbeat (Edge / Chrome throttle a minimised or covered window) can't shut it down.
  // The heartbeat itself runs in a worker, which the browser throttles far less than the page.
  // Each ping says whether the window is on screen: a visible page isn't throttled, so silence that starts
  // while it is visible means it has gone (e.g. the browser crashed without saying goodbye).
  const visibleFlag = () => (document.visibilityState === 'visible' ? '1' : '0');
  function startHeartbeat() {
    const ping = () => fetch('/api/ping?visible=' + visibleFlag(), { cache: 'no-store' }).catch(() => {});
    ping();
    let worker = null;
    try {
      const src = `let v = '1'; onmessage = (e) => { v = e.data; };
        setInterval(() => fetch(${JSON.stringify(location.origin + '/api/ping?visible=')} + v, { cache: 'no-store' }).catch(() => {}), 5000);`;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.postMessage(visibleFlag());
    } catch (e) { /* no workers: poll() below pings as well */ }
    let saidBye = false;
    const bye = () => {
      if (saidBye) return;
      saidBye = true;
      let sent = false;
      try { sent = navigator.sendBeacon('/api/bye'); } catch (e) { /* try fetch below */ }
      if (!sent) { try { fetch('/api/bye', { method: 'POST', keepalive: true }); } catch (e) { /* the idle limit covers it */ } }
    };
    window.addEventListener('pagehide', bye);
    window.addEventListener('beforeunload', bye);
    window.addEventListener('pageshow', (e) => { if (e.persisted) { saidBye = false; ping(); } });   // back from the bfcache
    document.addEventListener('visibilitychange', () => {
      if (worker) worker.postMessage(visibleFlag());
      ping();
      if (document.visibilityState === 'visible') poll();
    });
  }

  // --- conversion -------------------------------------------------------

  function footBand(raw) {
    if (raw >= 96) return 'Very Strong';
    if (raw >= 73) return 'Strong';
    if (raw >= 58) return 'Fairly Strong';
    if (raw >= 43) return 'Reasonable';
    if (raw >= 21) return 'Weak';
    return 'Very Weak';
  }

  function money(v) {
    if (!v) return '';
    if (v >= 1e6) return '£' + (v / 1e6 >= 100 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1).replace(/\.0$/, '')) + 'M';
    if (v >= 1e3) return '£' + Math.round(v / 1e3) + 'K';
    return '£' + v;
  }

  // Display-only star approximation of CA/PA (0-200 -> 0-5); the Potential
  // tab itself uses the raw PA number, so this never affects scoring.
  function stars(v) {
    return (Math.round(Math.min(5, v / 40) * 2) / 2).toString().replace('.', ',');
  }

  const INTEREST_LABELS = { 3: 'Interested', 2: 'Persuadable', 1: 'Doubtful', 0: 'Not interested', '-1': 'Not possible' };

  function toEnginePlayer(p) {
    const raw = {};
    meta.attrOrder.forEach((name, i) => {
      const v = p.attrs[i];
      if (name === '_LeftFoot') raw['Left Foot'] = footBand(v);
      else if (name === '_RightFoot') raw['Right Foot'] = footBand(v);
      else raw[name] = String(Math.max(1, Math.floor((v + 2) / 5)));
    });
    meta.personalityOrder.forEach((name, i) => { raw[name] = String(p.pers[i]); });
    raw['Player'] = p.name;
    raw['Name'] = p.name;
    raw['Age'] = String(p.age);
    raw['Position'] = p.pos;
    raw['Unique ID'] = String(p.id);
    raw['CA'] = String(p.ca);
    raw['PA'] = String(p.pa);
    raw['Ability'] = stars(p.ca);
    raw['Potential'] = stars(p.pa);
    raw['Transfer Value'] = money(p.value);
    raw['Wage'] = p.wage ? money(p.wage) + ' p/w' : '';
    raw['Expires'] = p.expires || '';
    // Where he plays now; a player on loan also names the club that owns him.
    raw['Club'] = p.parent && p.status !== 'loan_in' ? `${p.club} (loan from ${p.parent})` : (p.club || '');
    // Same column the CSV export uses, so loan-ins (who belong to another club) are never offered as sellable.
    raw['On Loan From'] = p.loanFrom || '';
    if (p.status === 'loan_out') raw['On Loan To'] = p.club || '';
    raw['Nation'] = p.nation || '';
    // Nationality-based guide for a club in your country (see the Scouting Pool filter).
    raw['Work Permit'] = p.needsPermit === true ? 'Needed' : (p.needsPermit === false ? 'Not needed' : '');
    // Estimated interest in joining your club on a transfer / on a loan (see the Scouting Pool filter).
    raw['Interest'] = INTEREST_LABELS[p.interest] || '';
    raw['Loan Interest'] = INTEREST_LABELS[p.loanInterest] || '';
    raw['Height'] = p.height ? p.height + ' cm' : '';
    raw['DoB'] = p.dob || '';
    const normRaw = {};
    Object.keys(raw).forEach((k) => { normRaw[k.toLowerCase().trim()] = raw[k]; });
    // Exact attributes for the engine (the 1-100 game scale / 5, in the engine's own order), the game's 1-20
    // position ratings and the feet: the engine scores from these, not from the rounded text above.
    const v = new Float32Array(ATTR_ORDER.length).fill(NaN);
    meta.attrOrder.forEach((name, i) => {
      const idx = ATTR_INDEX[attrKey(name)];
      if (idx !== undefined && name !== '_LeftFoot' && name !== '_RightFoot') v[idx] = p.attrs[i] / 5;
    });
    const lf = meta.attrOrder.indexOf('_LeftFoot');
    const rf = meta.attrOrder.indexOf('_RightFoot');
    // Injury status (squad lists only use it): undefined when the server doesn't say, so the checkbox stays hidden.
    const injured = typeof p.injured === 'boolean' ? p.injured : undefined;
    return {
      info: { Player: p.name, Age: p.age || null, Position: p.pos }, raw, normRaw, injured, injury: p.injury || '',
      _v: v, ratings: p.ratings, feet: { l: p.attrs[lf] / 5, r: p.attrs[rf] / 5 },
      ca: p.ca, pa: p.pa, valueNum: p.value || 0, wageNum: p.wage || 0, expires: p.expires || '',
      // Today's condition and match sharpness in % (the squad list re-reads them on every load).
      condition: typeof p.condition === 'number' ? p.condition : undefined,
      sharpness: typeof p.sharpness === 'number' ? p.sharpness : undefined,
    };
  }

  // --- status / actions ---------------------------------------------------

  function setStatus(kind, headline, sub) {
    const box = $('liveStatus');
    if (!box) return;
    box.innerHTML = `<div><span class="dot ${kind}"></span><strong>${headline}</strong></div>` +
      (sub ? `<div class="sub">${sub}</div>` : '');
  }

  function describe(info) {
    if (!info) return '';
    const secs = (info.total_ms / 1000).toFixed(1);
    const head = `${info.players.toLocaleString()} players read in ${secs}s &middot; game date ${info.game_date}`;
    if (!info.club) {
      return `${head}<br>No club found for you (between jobs?) &mdash; the squad tabs stay empty, but Scouting still works.`;
    }
    let squad = `${info.club}: ${info.squad} in squad`;
    const extra = [];
    if (info.loan_in) extra.push(`${info.loan_in} on loan from other clubs`);
    if (info.loaned_out) extra.push(`${info.loaned_out} out on loan`);
    if (info.left) extra.push(`${info.left} since left`);
    if (extra.length) squad += ` (${extra.join(', ')})`;
    return `${head}<br>${squad}`;
  }

  // Only shown if the game still marks players at more than one club (you changed job in this save).
  function updateClubPicker(info) {
    const row = $('liveClubRow');
    const sel = $('liveClub');
    if (!row || !sel) return;
    const list = (info && info.club_candidates) || [];
    row.hidden = list.length < 2;
    sel.textContent = '';
    list.forEach((c) => sel.add(new Option(`${c.name || 'Unnamed club'} (${c.flagged})`, String(c.ptr), false, c.ptr === info.club_ptr)));
  }

  async function changeClub() {
    const sel = $('liveClub');
    if (!sel || !sel.value) return;
    try {
      const st = await api('/api/setclub?ptr=' + encodeURIComponent(sel.value));
      lastInfo = st.info;
      setStatus('ok', `Connected to ${game}`, describe(st.info));
      updatePermitNote(st.info);
      updateClubPicker(st.info);
      await loadSquad();
      if (poolLoaded) loadPool();
    } catch (e) {
      setStatus('bad', 'Couldn\'t switch club', e.message);
    }
  }

  function updatePermitNote(info) {
    const note = $('poolPermitNote');
    if (note) {
      note.textContent = info && info.permit_rule
        ? `Nationality check — ${info.permit_rule}.`
        : 'Needs your club to be found first (press Scan Game).';
    }
    const inote = $('poolInterestNote');
    if (inote) {
      inote.textContent = info && info.interest_rule
        ? `Interest is ${info.interest_rule}.`
        : 'Interest needs your club to be found first (press Scan Game).';
    }
    const hgRow = $('poolHgRow');
    const hgNote = $('poolHgNote');
    const ready = !!(info && info.home_grown_ready);
    if (hgRow) hgRow.classList.toggle('unavailable', !ready);
    if ($('poolHgOn')) {
      $('poolHgOn').disabled = !ready;
      if (!ready) $('poolHgOn').checked = false;
      syncHgRow();
    }
    if (hgNote) {
      hgNote.textContent = ready
        ? 'Read from the game\'s own eligibility list (a player\'s Personal → Eligibility screen): only rows that are Fully Eligible count, a club counts for its country, and (0-21) includes (15-21).'
        : 'Home-grown status needs a scan of the game first (press Scan Game).';
    }
  }

  // The game's Player Interest dialog shows the interest levels under whichever option is picked.
  function syncInterestBox() {
    const levels = $('poolInterestLevels');
    const picked = document.querySelector('input[name="poolInterestMode"]:checked');
    if (!levels || !picked) return;
    const mode = picked.value;
    levels.hidden = !(mode === 'tl' || mode === 'transfer' || mode === 'loan');
    if (!levels.hidden) picked.closest('label').after(levels);
  }

  function syncHgRow() {
    const on = $('poolHgOn') && $('poolHgOn').checked;
    const row = $('poolHgRow');
    if (row) row.classList.toggle('off', !on);
    const rule = $('poolHgRule') ? $('poolHgRule').value : '';
    if ($('poolHgNation')) $('poolHgNation').hidden = rule.startsWith('club');     // club rules are about your club
  }

  async function loadNations() {
    try {
      const { nations } = await api('/api/nations');
      const list = $('poolNationList');
      if (!list || !nations) return;
      list.textContent = '';
      nations.forEach((n) => list.appendChild(new Option(n)));
    } catch (e) { /* just no suggestions */ }
  }

  async function loadSquad() {
    const incl = $('liveLoanedOut') && $('liveLoanedOut').checked ? '?includeLoanedOut=1' : '';
    const { players } = await api('/api/squad' + incl);
    window.FM26App.setSquad(players.map(toEnginePlayer), `${players.length} players at ${(lastInfo && lastInfo.club) || 'your club'} (live)`, lastInfo);
    return players.length;
  }

  /** The world lists (best players / next gen) for the World tab. */
  async function fetchTop(opts) {
    const q = new URLSearchParams();
    Object.keys(opts).forEach((k) => { if (opts[k] !== '' && opts[k] !== null && opts[k] !== undefined) q.set(k, opts[k]); });
    const { players } = await api('/api/top?' + q.toString());
    return players.map(toEnginePlayer);
  }

  async function loadPool() {
    const btn = $('poolLoadBtn');
    const get = (id) => ($(id) ? $(id).value.trim() : '');
    const q = new URLSearchParams();
    [['minAge', 'poolMinAge'], ['maxAge', 'poolMaxAge'], ['minPA', 'poolMinPA'], ['minCA', 'poolMinCA'],
      ['position', 'poolPosition'], ['nation', 'poolNation'], ['limit', 'poolLimit'],
      ['minValue', 'poolMinValue'], ['maxValue', 'poolMaxValue']].forEach(([k, id]) => {
      const v = get(id);
      if (v) q.set(k, v);
    });
    const mode = document.querySelector('input[name="poolInterestMode"]:checked');
    if (mode && mode.value) {
      q.set('interestMode', mode.value);
      const level = document.querySelector('input[name="poolInterestLevel"]:checked');
      if (mode.value !== 'none' && level) q.set('interest', level.value);
    }
    if ($('poolHgOn') && $('poolHgOn').checked && !$('poolHgOn').disabled) {
      q.set('hgRule', get('poolHgRule'));
      if (!get('poolHgRule').startsWith('club')) q.set('hgNation', get('poolHgNation'));
      if (get('poolHgOp') === 'not') q.set('hgNot', '1');
    }
    if ($('poolUnattached') && $('poolUnattached').checked) q.set('includeUnattached', '1');
    if ($('poolNoPermit') && $('poolNoPermit').checked) q.set('excludePermit', '1');
    if (btn) btn.disabled = true;
    if ($('poolStatus')) $('poolStatus').textContent = 'Querying the database…';
    try {
      const { players, total, truncated } = await api('/api/pool?' + q.toString());
      const n = players.length.toLocaleString();
      window.FM26App.setScoutPool(players.map(toEnginePlayer), `${n} players loaded from the database`);
      poolLoaded = true;
      if ($('poolStatus')) {
        $('poolStatus').textContent = truncated
          ? `${n} of ${total.toLocaleString()} matching players loaded (best potential first) — narrow the filters to see the rest.`
          : `${n} players loaded — everything that matches. See the Scouting tab.`;
      }
    } catch (e) {
      if ($('poolStatus')) $('poolStatus').textContent = 'Could not load pool: ' + e.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // A scan can fail for a moment - a save still loading, the game busy with something - and then
  // work a few seconds later. So a failure never ends in a dead button: it retries by itself
  // (4 s, 8 s, 16 s, then every 30 s) and the last good data stays on screen meanwhile.
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = null; scan(true); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }

  function cancelRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
    retryDelay = 4000;
  }

  async function scan(auto) {
    if (scanning) return;
    scanning = true;
    clearTimeout(retryTimer);
    retryTimer = null;
    if (auto !== true) retryDelay = 4000;          // a button press starts the back-off over
    const btn = $('liveScanBtn');
    if (btn) btn.disabled = true;
    setStatus('warn', 'Scanning Football Manager…', 'Reading the whole database from memory.');
    try {
      const st = await api('/api/scan');
      setGame(st.game);
      if (st.error) {
        setStatus('warn', st.scanned ? 'Couldn\'t refresh yet' : 'Couldn\'t read the game yet',
          `${st.error}${st.scanned ? '<br>Still showing your last good scan.' : ''}<br><em>Trying again automatically…</em>`);
        scheduleRetry();
        return;
      }
      cancelRetry();
      lastInfo = st.info;
      setStatus('ok', `Connected to ${game}`, describe(st.info));
      updatePermitNote(st.info);
      updateClubPicker(st.info);
      await loadSquad();
      loadNations();
      if (!window.__poolAutoLoaded || poolLoaded) {      // first time, or refresh a pool that was already loaded
        window.__poolAutoLoaded = true;
        loadPool();
      }
    } catch (e) {
      setStatus('warn', 'Couldn\'t scan yet', `${e.message}<br><em>Trying again automatically…</em>`);
      scheduleRetry();
    } finally {
      scanning = false;
      if (btn) btn.disabled = false;
    }
  }

  let pollFailures = 0;

  async function poll() {
    try {
      api('/api/ping?visible=' + visibleFlag()).catch(() => { /* the status call below reports a dead server */ });
      if (scanning) return;
      let st;
      try {
        st = await api('/api/status');
        pollFailures = 0;
      } catch (e) {
        // A busy moment can drop one request; three in a row (~15 s) means the app has stopped.
        if (++pollFailures >= 3) setStatus('bad', 'FM27 Plus has stopped', `${e.message}<br>Your last results stay on screen.`);
        return;
      }
      setGame(st.game);
      if (!st.running) {
        cancelRetry();
        setStatus('bad', 'Football Manager isn\'t running', 'Start the game and load your save &mdash; this connects by itself.');
      } else if (st.scanned && st.info && st.pid && st.info.pid !== st.pid) {
        scan(true);                                    // the game was restarted: its memory is all new
      } else if (!st.scanned) {
        if (!retryTimer) scan(true);                   // game found but nothing read yet: go and look
      } else if (st.error) {
        setStatus('warn', 'Couldn\'t refresh', `${st.error}<br>Still showing your last good scan.`);
        if (!retryTimer) scheduleRetry();
      } else {
        setStatus('ok', `Connected to ${game}`, describe(st.info) + (st.scan_age_s > 60 ? ` &middot; <em>scanned ${Math.round(st.scan_age_s / 60)} min ago — rescan to refresh</em>` : ''));
      }
    } catch (e) { /* server briefly busy */ }
  }

  async function start() {
    let status;
    try {
      status = await api('/api/status');
    } catch (e) {
      return;            // not served by the app: stay a plain web page
    }
    meta = await api('/api/meta');
    startHeartbeat();
    window.FM26Live = { fetchTop };
    setGame(status.game);
    document.body.classList.add('memory-mode');
    if ($('livePanel')) $('livePanel').hidden = false;
    if ($('poolPanel')) $('poolPanel').hidden = false;
    updatePermitNote(status.info);
    updateClubPicker(status.info);
    window.FM26App.setEmptyMessages(
      'Press "Scan Game" on the left (with your save open in Football Manager) to load your squad, then pick pitch positions.',
      'Set the filters in "Scouting Pool" and press Load Pool to rank players from the entire database against your tactic.');
    if ($('liveScanBtn')) $('liveScanBtn').addEventListener('click', () => scan(false));
    if ($('poolLoadBtn')) $('poolLoadBtn').addEventListener('click', loadPool);
    if ($('liveLoanedOut')) $('liveLoanedOut').addEventListener('change', () => { loadSquad().catch(() => {}); });
    if ($('liveClub')) $('liveClub').addEventListener('change', changeClub);
    document.querySelectorAll('input[name="poolInterestMode"]').forEach((r) => r.addEventListener('change', syncInterestBox));
    ['poolHgOn', 'poolHgRule'].forEach((id) => { if ($(id)) $(id).addEventListener('change', syncHgRow); });
    syncInterestBox();
    syncHgRow();
    if (status.scanned) {
      // The server already holds a scan (e.g. the window was reopened): show it straight away.
      lastInfo = status.info;
      setStatus(status.error ? 'warn' : 'ok', `Connected to ${game}`, describe(status.info));
      loadSquad().then(() => {
        loadNations();
        if (!window.__poolAutoLoaded) { window.__poolAutoLoaded = true; loadPool(); }
      }).catch((e) => setStatus('bad', 'Could not load squad', e.message));
      poll();
    } else if (status.running) {
      scan(true);
    } else {
      poll();
    }
    setInterval(poll, 5000);
  }

  function boot() {
    // app.js initialises on DOMContentLoaded and announces itself when ready.
    if (document.readyState === 'loading') {
      document.addEventListener('fm26app-ready', start, { once: true });
    } else {
      start();
    }
  }
  boot();
})();
