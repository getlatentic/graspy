#!/usr/bin/env bash
# Launch the packaged app the way teachers do (LaunchServices, not a terminal),
# twice in a row, and assert: it survives, only one instance runs, and no new
# crash reports appear. Usage: scripts/launch-smoke.sh [path/to/graspy.app]
set -euo pipefail

APP="${1:-src-tauri/target/release/bundle/macos/graspy.app}"
BIN="$APP/Contents/MacOS/graspy-teacher"
REPORTS="$HOME/Library/Logs/DiagnosticReports"
[ -x "$BIN" ] || { echo "FAIL: no binary at $BIN"; exit 1; }

before=$(find "$REPORTS" -name 'graspy*' 2>/dev/null | wc -l | tr -d ' ')
pkill -f "$BIN" 2>/dev/null || true
sleep 1

open "$APP"
sleep 8
open "$APP"   # second launch must focus the first instance, not race it
sleep 5

instances=$(pgrep -f "$BIN" | wc -l | tr -d ' ')
after=$(find "$REPORTS" -name 'graspy*' 2>/dev/null | wc -l | tr -d ' ')
pkill -f "$BIN" 2>/dev/null || true

[ "$instances" -eq 1 ] || { echo "FAIL: expected 1 instance, found $instances"; exit 1; }
[ "$after" -eq "$before" ] || { echo "FAIL: $((after - before)) new crash report(s) in $REPORTS"; exit 1; }
echo "PASS: single instance survived double launch, no new crash reports"
