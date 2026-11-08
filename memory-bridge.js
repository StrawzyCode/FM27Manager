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

  async function api(path) {
    const res = await fetch(path, { cache: 'no-store' });
    let body = null;
    try { body = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) throw new Error((body && body.error) || res.statusText);
    return body;
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
    // Estimated interest in joining your club (3 interested .. 0 unlikely), see the Scouting Pool filter.
    raw['Interest'] = ({ 3: 'Interested', 2: 'Slightly interested', 1: 'Doubtful', 0: 'Unlikely' })[p.interest] || '';
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
        ? `Interest: ${info.interest_rule}.`
        : 'Interest needs your club to be found first (press Scan Game).';
    }
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
      ['minValue', 'poolMinValue'], ['maxValue', 'poolMaxValue'], ['interest', 'poolInterest']].forEach(([k, id]) => {
      const v = get(id);
      if (v) q.set(k, v);
    });
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

  async function poll() {
    try {
      api('/api/ping').catch(() => { /* the status call below reports a dead server */ });
      if (scanning) return;
      const st = await api('/api/status');
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
    if (status.scanned) {
      // The server already holds a scan (e.g. the window was reopened): show it straight away.
      lastInfo = status.info;
      setStatus(status.error ? 'warn' : 'ok', `Connected to ${game}`, describe(status.info));
      loadSquad().then(() => {
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
