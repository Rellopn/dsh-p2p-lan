#!/usr/bin/env bash
set -uo pipefail
# Kill the old dsh web (started earlier in a terminal).
for pid in 1632753 1632782 1632783; do
  kill "$pid" 2>/dev/null && echo "killed $pid" || true
done
sleep 2

# Start the new dsh web with the preserved environment; logs go to web.log.
set -a
# shellcheck disable=SC1091
source /home/rellopn/.dsh/env.restore 2>/dev/null
set +a
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
cd /home/rellopn/.dsh/profiles/web
nohup npm exec @deepseek-ai/dsh web --port 3081 > /home/rellopn/.dsh/web.log 2>&1 &
echo "STARTED_PID=$!"
