#!/usr/bin/env bash
set -uo pipefail
echo "=== wsl.conf ==="
cat /etc/wsl.conf 2>/dev/null || echo "no wsl.conf"
echo "=== systemd? ==="
systemctl is-system-running 2>&1 | head -2 || true
ps -p 1 -o comm= 2>/dev/null
