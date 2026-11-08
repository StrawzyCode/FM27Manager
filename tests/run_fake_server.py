"""Start the real FM27 Plus server against the synthetic process (no game needed), then open
http://127.0.0.1:47027/ in a browser.

    python tests/run_fake_server.py [--calibrated] [--grace N] [--idle N] [--visible N]

--calibrated patches in the synthetic career-history layout so the home-grown filter works;
--grace / --idle / --visible shorten the window-closed timers (seconds) for testing.
"""
import os
import sys
S = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, S)
import fakefm
w = fakefm.build(); fakefm.install(w)
if '--calibrated' in sys.argv:
    fakefm.patch_history_layout()
os.chdir(fakefm.REPO)
import server
for flag, attr in (('--grace', 'CLOSED_GRACE'), ('--idle', 'IDLE_LIMIT'), ('--visible', 'VISIBLE_SILENCE')):
    if flag in sys.argv:
        setattr(server, attr, float(sys.argv[sys.argv.index(flag) + 1]))
sys.argv.append('--no-window')
sys.exit(server.main())
