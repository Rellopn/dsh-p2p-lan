#!/usr/bin/env bash
set -uo pipefail
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
echo "=== who owns 53420/53421 now ==="
ss -tlnp 2>/dev/null | grep -E '53420|53421'
echo "=== try foreground start (15s) ==="
cd /home/rellopn/.dsh/profiles/web
timeout 15 npm exec @deepseek-ai/dsh web --port 3081 2>&1 | head -25
echo "FG_EXIT=${PIPESTATUS[0]}"
