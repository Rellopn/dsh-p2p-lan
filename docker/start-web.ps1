# Start the two-node LAN P2P stack via docker compose (single network).
#   node A -> http://localhost:3180
#   node B -> http://localhost:3280
# Key comes from ./.env (gitignored); override by setting $env:DEEPSEEK_API_KEY first.
$ErrorActionPreference = 'Stop'

docker compose up -d
Write-Host "Waiting for both nodes to boot..."
Start-Sleep -Seconds 25
Write-Host ""
Write-Host "Node A UI: http://localhost:3180  (nodeName=A, peer=B)"
Write-Host "Node B UI: http://localhost:3280  (nodeName=B, peer=A)"
Write-Host ""
docker compose ps --format '{{.Name}}  {{.Status}}  {{.Ports}}'
