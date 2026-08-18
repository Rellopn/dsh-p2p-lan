#!/usr/bin/env bash
set -uo pipefail
echo "=== dsh web stdout/stderr fds ==="
ls -l /proc/1981733/fd/1 /proc/1981733/fd/2 2>/dev/null
echo "=== journalctl (dsh-web) ==="
journalctl -u dsh-web -n 15 --no-pager 2>&1 | tail -15
echo "=== search log files ==="
find /home/rellopn/.dsh /home/rellopn/.cache /var/log -maxdepth 3 -name '*.log' -newermt '2026-08-18 18:50' 2>/dev/null | head -15
echo "=== dsh dirs ==="
ls -la /home/rellopn/.dsh/ 2>/dev/null
