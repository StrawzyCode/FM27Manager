"""FM27 Plus - local app (also reads FM26).

Serves the web UI and a small JSON API backed by live reads of the running
Football Manager process. Nothing leaves this machine, and the game's memory
is only ever read, never written.
"""
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

from fm26mem import FM26Reader, FMNotRunning, LayoutError
from fm26mem import layout as L

APP_NAME = 'FM27 Plus'
PORT = int(os.environ.get('FMPLUS_PORT', '47027'))      # FM26Plus.exe used 47026, so both can coexist
WEB_FILES = {'index.html', 'app.js', 'engine.js', 'styles.css', 'memory-bridge.js'}
# (build_exe.bat bundles the same files)
# The most players one scouting pool will hold. A blank "Max players" loads every match up to this;
# each one is then ranked against every position of your tactic in the browser (~3 s and ~290 MB for
# 40,000 players over 11 positions). The default filters match ~12k players, well inside it.
POOL_CEILING = 40000


def base_dir():
    return getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))


class State:
    def __init__(self):
        self.reader = FM26Reader()
        self.lock = threading.Lock()
        self.error = None
        self.last_scan_at = None
        self.last_ping = time.time()
        self.seen_ui = False
        self.club_override = None           # club pointer picked in the UI (None = automatic)


STATE = State()


def status_payload():
    games = STATE.reader.games()
    pid = games[0][0] if games else None
    snap = STATE.reader.snapshot
    out = {
        'app': APP_NAME,
        'running': pid is not None,
        'pid': pid,
        'game': games[0][1] if games else '',          # e.g. 'FM27'
        'scanned': snap is not None,
        'error': STATE.error,
        'info': snap.info if snap is not None else None,
        'scan_age_s': int(time.time() - STATE.last_scan_at) if STATE.last_scan_at else None,
    }
    return out


def do_scan():
    with STATE.lock:
        try:
            snap = STATE.reader.scan()
            if STATE.club_override:             # keep the club chosen in the UI across rescans
                snap.set_home(STATE.club_override)
            STATE.error = None
            STATE.last_scan_at = time.time()
        except FMNotRunning as e:
            STATE.error = str(e)
        except LayoutError as e:
            STATE.error = str(e)
        except Exception as e:                      # keep the UI informed instead of dying
            traceback.print_exc()
            STATE.error = 'Scan failed (%s): %s' % (type(e).__name__, e)
    # A failed rescan leaves the last good snapshot in place, so the UI can keep working with it.
    return status_payload()


def players_payload(idx):
    snap = STATE.reader.snapshot
    idx = [int(i) for i in idx]
    snap.enrich(idx)
    return [snap.player(i) for i in idx]


def meta_payload():
    return {
        'attrOrder': L.ATTR_ORDER,
        'personalityOrder': L.PERSONALITY_ORDER,
        'positionCodes': L.POSITION_CODES,
    }


def _num(q, key, cast=int):
    v = q.get(key, [None])[0]
    if v in (None, ''):
        return None
    try:
        return cast(v)
    except ValueError:
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = 'FM27Plus/1.0'

    def log_message(self, fmt, *args):            # quiet console
        pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, separators=(',', ':'), ensure_ascii=False))

    def do_POST(self):
        self.do_GET()

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        q = parse_qs(url.query)
        try:
            if path == '/' or path == '/index.html':
                return self._file('index.html')
            if path.lstrip('/') in WEB_FILES:
                return self._file(path.lstrip('/'))
            if path == '/api/ping':
                STATE.last_ping = time.time()
                STATE.seen_ui = True
                return self._json({'ok': True})
            if path == '/api/status':
                return self._json(status_payload())
            if path == '/api/meta':
                return self._json(meta_payload())
            if path == '/api/scan':
                return self._json(do_scan())
            if path == '/api/quit':
                self._json({'ok': True})
                threading.Thread(target=lambda: (time.sleep(0.2), os._exit(0)), daemon=True).start()
                return
            snap = STATE.reader.snapshot
            if path.startswith('/api/') and snap is None:
                return self._json({'error': STATE.error or 'Not scanned yet.'}, 409)
            if path == '/api/setclub':           # pick which candidate club is "mine" (0 = automatic)
                ptr = _num(q, 'ptr') or 0
                with STATE.lock:
                    STATE.club_override = ptr or None
                    snap.set_home(ptr or None)
                return self._json(status_payload())
            if path == '/api/squad':
                with STATE.lock:
                    try:
                        snap.injuries()     # lets every row say whether he is injured (cached for this scan)
                    except Exception:       # never let the injury read stop the squad from loading; the rows just carry no flag
                        traceback.print_exc()
                    idx = snap.squad_indices(include_loaned_out=q.get('includeLoanedOut', ['0'])[0] == '1')
                    players = players_payload(idx)
                return self._json({'players': players})
            if path == '/api/pool':
                asked = _num(q, 'limit')                  # blank / 0 = everything that matches the filters
                limit = POOL_CEILING if not asked or asked <= 0 else min(asked, POOL_CEILING)
                unattached = q.get('includeUnattached', ['0'])[0] == '1'
                min_value, max_value = _num(q, 'minValue', float), _num(q, 'maxValue', float)    # in millions
                with STATE.lock:
                    snap.permit_needed()        # lets every row say whether he needs a work permit (cached)
                    snap.interest_levels()      # ... and how interested he is in joining (cached)
                    # every match, best potential first
                    idx = snap.query(
                        min_age=_num(q, 'minAge'), max_age=_num(q, 'maxAge'),
                        min_pa=_num(q, 'minPA'), min_ca=_num(q, 'minCA'),
                        exclude_squad=q.get('includeSquad', ['0'])[0] != '1',
                        position=q.get('position', [None])[0] or None,
                        nation=q.get('nation', [None])[0] or None,
                        text=q.get('q', [None])[0] or None,
                        min_value=None if min_value is None else round(min_value * 1_000_000),
                        max_value=None if max_value is None else round(max_value * 1_000_000),
                        exclude_permit=q.get('excludePermit', ['0'])[0] == '1',
                        min_interest=_num(q, 'interest'),
                        limit=10 ** 9)
                    if not unattached:       # many of the top potentials are the engine's unassigned youth prospects
                        idx = idx[snap.club_ptr[idx] != 0]
                    total = int(len(idx))
                    players = players_payload(idx[:limit])
                return self._json({'players': players, 'total': total, 'limit': limit, 'truncated': total > limit})
            if path == '/api/top':               # the world's best players (by ability) or the next generation (by potential)
                kind = q.get('kind', ['best'])[0]
                limit = max(1, min(_num(q, 'limit') or 100, 300))
                max_age = _num(q, 'maxAge')
                if kind == 'nextgen' and max_age is None:
                    max_age = 21
                with STATE.lock:
                    idx = snap.query(max_age=max_age, position=q.get('position', [None])[0] or None,
                                     nation=q.get('nation', [None])[0] or None, exclude_squad=False,
                                     sort='pa' if kind == 'nextgen' else 'ca', limit=limit * 3)
                    idx = idx[snap.club_ptr[idx] != 0][:limit]       # players attached to a club
                    players = players_payload(idx)
                return self._json({'players': players})
            if path == '/api/search':
                text = (q.get('q', [''])[0] or '').strip()
                limit = max(1, min(_num(q, 'limit') or 25, 100))
                with STATE.lock:
                    idx = snap.query(text=text, exclude_squad=False, limit=limit) if text else []
                    players = players_payload(idx)
                return self._json({'players': players})
            self._send(404, '{"error":"not found"}')
        except Exception as e:
            traceback.print_exc()
            self._json({'error': str(e)}, 500)

    def _file(self, name):
        full = os.path.join(base_dir(), name)
        if not os.path.exists(full):
            return self._send(404, 'missing ' + name, 'text/plain')
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript',):
            ctype += '; charset=utf-8'
        with open(full, 'rb') as f:
            self._send(200, f.read(), ctype)


def find_browser():
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'):
        if os.path.exists(p):
            return p
    return shutil.which('msedge') or shutil.which('chrome')


def open_window(url):
    exe = find_browser()
    if exe:
        try:
            subprocess.Popen([exe, '--app=' + url, '--window-size=1560,980'])
            return
        except OSError:
            pass
    webbrowser.open(url)


def watchdog():
    """Exit when the UI window has been closed (no heartbeat for a while)."""
    while True:
        time.sleep(3)
        if STATE.seen_ui and time.time() - STATE.last_ping > 25:
            os._exit(0)


def already_running(port):
    """True if another FM27 Plus instance is already serving on this port."""
    import urllib.request
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/status' % port, timeout=1.5) as r:
            return json.loads(r.read()).get('app') == APP_NAME
    except Exception:
        return False


def setup_logging():
    """The windowed exe has no console, so keep a log file for troubleshooting."""
    if sys.stdout is not None and sys.stderr is not None:
        return
    folder = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'FM27Plus')
    os.makedirs(folder, exist_ok=True)
    log = open(os.path.join(folder, 'log.txt'), 'a', encoding='utf-8', buffering=1)
    sys.stdout = sys.stderr = log


def main():
    setup_logging()
    if already_running(PORT):
        if '--no-window' not in sys.argv:
            open_window('http://127.0.0.1:%d/' % PORT)
        return 0
    port = PORT
    server = None
    for p in range(PORT, PORT + 20):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', p), Handler)
            port = p
            break
        except OSError:
            continue
    if server is None:
        print('Could not open a local port.')
        return 1
    url = 'http://127.0.0.1:%d/' % port
    threading.Thread(target=watchdog, daemon=True).start()
    if '--no-window' not in sys.argv:
        threading.Thread(target=lambda: (time.sleep(0.4), open_window(url)), daemon=True).start()
    print('%s running at %s  (close the window or press Ctrl+C to quit)' % (APP_NAME, url))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
