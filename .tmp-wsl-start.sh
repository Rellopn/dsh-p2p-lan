#!/usr/bin/env bash
set -uo pipefail
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
DSH_BIN=/home/rellopn/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh

set -a
# shellcheck disable=SC1091
source /home/rellopn/.dsh/env.restore 2>/dev/null
set +a
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"

cd /home/rellopn/.dsh/profiles/web
setsid nohup "$DSH_BIN" web --port 3081 > /home/rellopn/.dsh/web.log 2>&1 < /dev/null &
disown 2>/dev/null || true
echo "STARTED_PID=$!"
