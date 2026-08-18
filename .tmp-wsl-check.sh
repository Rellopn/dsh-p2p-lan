#!/usr/bin/env bash
set -uo pipefail
sleep 8
echo "=== listeners ==="
ss -tlnp 2>/dev/null | grep -E '3081|5342' | head -8
echo "=== web.log (p2p lines + tail) ==="
grep -iE 'p2p|plugin|error|warn' /home/rellopn/.dsh/web.log 2>/dev/null | tail -20
echo "=== web.log tail ==="
tail -12 /home/rellopn/.dsh/web.log 2>/dev/null
echo "=== proc ==="
ps aux | grep 'dsh web' | grep -v grep | head -3
