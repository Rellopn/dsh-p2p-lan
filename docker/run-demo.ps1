# Two-node LAN P2P demo. Requires the image built via:
#   docker build -t dsh-p2p-lan-node:latest -f docker/Dockerfile .
param(
  [string]$ApiKey = $env:DEEPSEEK_API_KEY,
  [string]$Task = "请调用 p2p_send_and_wait 工具，目标节点名称为 B，消息正文为：你好，请用一句话告诉我你现在运行在哪个节点。调用后把返回结果中的回复内容原样告诉我。"
)

if (-not $ApiKey) { throw "DEEPSEEK_API_KEY is required (pass -ApiKey or set env)" }

$ErrorActionPreference = 'Stop'

docker network create p2p-net 2>$null | Out-Null

Write-Host "== starting receiver node B (persistent web node) =="
docker rm -f p2p-b 2>$null | Out-Null
docker run -d --name p2p-b --network p2p-net `
  -e NODE_ROLE=receiver -e NODE_NAME=B `
  -e PEER_NAME=A -e PEER_HOST=p2p-a -e PEER_PORT=53420 `
  -e PROVIDER=deepseek-official -e MODEL=deepseek-v4-flash -e SENSITIVITY=lenient `
  -e DEEPSEEK_API_KEY=$ApiKey `
  dsh-p2p-lan-node:latest | Out-Null

Write-Host "== waiting for node B to finish booting =="
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  $log = docker logs p2p-b 2>&1 | Out-String
  if ($log -match 'dsh web:|p2p-lan' -and $log -notmatch 'error') { $ready = $true; break }
}
if (-not $ready) {
  Write-Host "node B log so far:"
  docker logs p2p-b 2>&1
  throw "node B did not become ready in time"
}
Write-Host "node B is up."

Write-Host "== running sender node A (one-shot headless) =="
docker rm -f p2p-a 2>$null | Out-Null
docker run --rm --name p2p-a --network p2p-net `
  -e NODE_ROLE=sender -e NODE_NAME=A `
  -e PEER_NAME=B -e PEER_HOST=p2p-b -e PEER_PORT=53420 `
  -e PROVIDER=deepseek-official -e MODEL=deepseek-v4-flash -e SENSITIVITY=lenient `
  -e DEEPSEEK_API_KEY=$ApiKey `
  -e TASK=$Task `
  dsh-p2p-lan-node:latest

Write-Host "== sender finished; receiver node B still running as 'p2p-b' (docker logs p2p-b) =="
