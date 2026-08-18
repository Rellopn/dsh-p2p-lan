#!/usr/bin/env bash
set -uo pipefail
echo "=== web.log size ==="
wc -l /home/rellopn/.dsh/web.log 2>/dev/null
echo "=== p2p/error lines ==="
grep -iE 'p2p|error|fail' /home/rellopn/.dsh/web.log 2>/dev/null | tail -15 || true
echo "=== tail ==="
tail -8 /home/rellopn/.dsh/web.log 2>/dev/null
echo "=== plugin version in use ==="
node -e "const p=require('/home/rellopn/.dsh/profiles/web/node_modules/@rellopn/dsh-p2p-lan/package.json'); console.log(p.version)"
