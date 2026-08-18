#!/usr/bin/env bash
echo "=== p2p-lan.log tail (last 15) ==="
tail -15 /home/rellopn/.dsh/p2p-lan.log
echo "=== last modified ==="
stat -c '%y' /home/rellopn/.dsh/p2p-lan.log 2>/dev/null
