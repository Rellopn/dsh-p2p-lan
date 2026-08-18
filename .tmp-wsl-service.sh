#!/usr/bin/env bash
set -uo pipefail
cat > /etc/systemd/system/dsh-web.service <<'EOF'
[Unit]
Description=DSH Web (p2p-lan node)
After=network.target

[Service]
User=rellopn
WorkingDirectory=/home/rellopn/.dsh/profiles/web
Environment=HOME=/home/rellopn
Environment=USER=rellopn
Environment=PATH=/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/rellopn/.local/share/fnm/node-versions/v24.3.0/installation/bin/node /home/rellopn/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js web --port 3081
Restart=always
RestartSec=3
StandardOutput=append:/home/rellopn/.dsh/web.log
StandardError=append:/home/rellopn/.dsh/web.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable dsh-web >/dev/null 2>&1
systemctl restart dsh-web
sleep 8
echo "=== service status ==="
systemctl is-active dsh-web
systemctl status dsh-web --no-pager 2>&1 | head -8
echo "=== listeners ==="
ss -tlnp 2>/dev/null | grep -E '3081|5342' | head -8
