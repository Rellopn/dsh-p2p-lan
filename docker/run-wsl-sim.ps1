# WSL-port-forward simulation on the docker bridge (which already does not
# forward multicast/broadcast, i.e. a broadcast-disabled network).
# Topology (all on one network; the relay stands in for Windows' portproxy):
#   remote peer (wsl-send, port 55001) -> relay (53421) -> WSL node (wsl-recv, 53420)
# WSL node replies to the peer directly (WSL2 NAT outbound works without a relay).
# Both sides use manualPeers only: no multicast, no auto-discovery.
$ErrorActionPreference = 'Continue'  # docker writes progress to stderr; check $LASTEXITCODE explicitly
$root = Split-Path -Parent $PSScriptRoot
$Image = 'dsh-p2p-lan-sim:local'

Write-Host '== building sim image (plugin modules + ws/zod inside, no host mounts) =='
docker build -t $Image -f "$PSScriptRoot\wsl-sim\Dockerfile.sim" $root 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'sim image build failed' }

docker network create p2p-wsl-sim 2>&1 | Out-Null

try {
  Write-Host '== WSL node (listens 53420, replies to wsl-send:55001) =='
  docker rm -f wsl-recv 2>&1 | Out-Null
  docker run -d --name wsl-recv --network p2p-wsl-sim `
    -e PEER_NAME=R -e PEER_HOST=wsl-send -e PEER_PORT=55001 `
    $Image node docker/wsl-sim/probe-recv.mjs 2>&1 | Out-Null
  Start-Sleep -Seconds 4

  Write-Host '== relay (Windows portproxy / socat equivalent) =='
  docker rm -f wsl-relay 2>&1 | Out-Null
  docker run -d --name wsl-relay --network p2p-wsl-sim `
    $Image node docker/wsl-sim/relay.mjs 53421 wsl-recv 53420 2>&1 | Out-Null
  Start-Sleep -Seconds 2

  Write-Host '== remote peer via the relay address (expect round-trip) =='
  docker run --rm --name wsl-send --network p2p-wsl-sim -e SEND_PORT=55001 `
    $Image node docker/wsl-sim/probe-send.mjs wsl-relay 53421 reply 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host '--- wsl-recv log ---'
    docker logs wsl-recv 2>&1
    Write-Host '--- wsl-relay log ---'
    docker logs wsl-relay 2>&1
    throw 'relay round-trip failed'
  }

  Write-Host '== remote peer via a bogus address (expect fail) =='
  docker run --rm --name wsl-send-bad --network p2p-wsl-sim -e SEND_PORT=55002 `
    $Image node docker/wsl-sim/probe-send.mjs 192.0.2.1 53420 fail 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'bogus address did not fail as expected' }
  Write-Host '== docker wsl-sim OK: manual-peer + relay round-trip verified, bogus address fails =='
} finally {
  docker rm -f wsl-recv wsl-relay wsl-send wsl-send-bad 2>&1 | Out-Null
  docker network rm p2p-wsl-sim 2>&1 | Out-Null
}