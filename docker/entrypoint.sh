#!/usr/bin/env bash
set -euo pipefail

ROLE="${NODE_ROLE:-receiver}"   # receiver (persistent web node) | sender (one-shot headless)
NODE_NAME="${NODE_NAME:-unnamed}"
PEER_NAME="${PEER_NAME:-}"
PEER_HOST="${PEER_HOST:-}"
PEER_PORT="${PEER_PORT:-53420}"
PORT="${PORT:-53420}"
WEB_PORT="${WEB_PORT:-3080}"
PROVIDER="${PROVIDER:-deepseek-official}"
MODEL="${MODEL:-deepseek-v4-flash}"
SENSITIVITY="${SENSITIVITY:-lenient}"
TASK="${TASK:-}"

if [ "$ROLE" = "sender" ]; then
  PROFILE="sender"
else
  PROFILE="node"
fi

DIR="$DSH_HOME/profiles/$PROFILE"

# Per-node P2P config, applied over the plugin bundle's default insert.
cat > "$DIR/cordis.patch.yml" <<EOF
- id: p2p-lan
  config:
    nodeName: '$NODE_NAME'
    capabilities: []
    autoDiscover: false
    manualPeers:
      - { name: '$PEER_NAME', host: '$PEER_HOST', port: $PEER_PORT }
    port: $PORT
    sensitivity: $SENSITIVITY
    sendWaitTimeoutMs: 300000
    provider: $PROVIDER
    model: $MODEL
    persona: ''
    projects: []
EOF

echo "=== boot: role=$ROLE profile=$PROFILE node=$NODE_NAME peer=$PEER_NAME@$PEER_HOST:$PEER_PORT ==="

if [ "$ROLE" = "sender" ]; then
  exec dsh --profile sender "$TASK"
else
  # dsh web binds 127.0.0.1 and refuses 0.0.0.0; socat exposes it on 0.0.0.0:8080
  # so a Docker -p publish can reach it. The /api fence still trusts the browser's
  # loopback Host (localhost / 127.0.0.1).
  socat TCP-LISTEN:8080,fork,reuseaddr TCP:127.0.0.1:"$WEB_PORT" &
  echo "web forward: 0.0.0.0:8080 -> 127.0.0.1:$WEB_PORT"
  exec dsh --profile node --port "$WEB_PORT"
fi
