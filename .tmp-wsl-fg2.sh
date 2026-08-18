#!/usr/bin/env bash
set -uo pipefail
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
DSH_BIN=/home/rellopn/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh
ls -la "$DSH_BIN"
file "$DSH_BIN" 2>/dev/null || true
echo "=== foreground run 20s ==="
cd /home/rellopn/.dsh/profiles/web
timeout 20 "$DSH_BIN" web --port 3081 2>&1 | head -30
echo "EXIT=${PIPESTATUS[0]}"
