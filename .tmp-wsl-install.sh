#!/usr/bin/env bash
set -uo pipefail
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
DSH_BIN=/home/rellopn/.npm/_npx/1e7f6d9597241db0/node_modules/.bin/dsh
TGZ=/mnt/e/code/dsh-p2p-lan/rellopn-dsh-p2p-lan-0.1.0-rc.13.tgz

echo "=== dsh plugin add ==="
"$DSH_BIN" plugin --profile web add "$TGZ" 2>&1 | tail -20
echo "PLUGIN_EXIT=$?"

echo "=== installed version ==="
node -e "const p=require('/home/rellopn/.dsh/profiles/web/node_modules/@rellopn/dsh-p2p-lan/package.json'); console.log('installed:', p.version)"
