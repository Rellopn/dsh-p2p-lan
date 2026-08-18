#!/usr/bin/env bash
export PATH="/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:$PATH"
node /mnt/e/code/dsh-p2p-lan/.tmp-diag-send.mjs
sleep 3
echo "=== web.log after diag ==="
tail -25 /home/rellopn/.dsh/web.log
