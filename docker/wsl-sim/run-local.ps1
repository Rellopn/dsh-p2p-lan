# Same verified topology without docker, runnable on any machine with node:
#   probe-recv (node S, 54720, replies to 127.0.0.1:54900)
#   <- relay (54721 -> 54720)
#   <- probe-send (peer R on 54900, targets the relay address)
# Run from the repo root:  pwsh docker/wsl-sim/run-local.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:RECV_PORT = '54720'
$env:PEER_NAME = 'R'
$env:PEER_HOST = '127.0.0.1'
$env:PEER_PORT = '54900'
$env:SEND_PORT = '54900'

$recv = Start-Process -FilePath node -ArgumentList @('docker/wsl-sim/probe-recv.mjs') -WorkingDirectory $root -RedirectStandardOutput "$root\.tmp-recv.log" -RedirectStandardError "$root\.tmp-recv.err" -WindowStyle Hidden -PassThru
# Cold-started node is slow on Windows; give the receiver time to bind.
Start-Sleep -Seconds 5
$relay = Start-Process -FilePath node -ArgumentList @('docker/wsl-sim/relay.mjs', '54721', '127.0.0.1', '54720') -WorkingDirectory $root -RedirectStandardOutput "$root\.tmp-relay.log" -RedirectStandardError "$root\.tmp-relay.err" -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

try {
  Write-Host '== peer via relay 54721 (expect reply) =='
  node docker/wsl-sim/probe-send.mjs 127.0.0.1 54721 reply
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  recv log: $(Get-Content "$root\.tmp-recv.log" -Raw -ErrorAction SilentlyContinue)"
    Write-Host "  relay log: $(Get-Content "$root\.tmp-relay.log" -Raw -ErrorAction SilentlyContinue)"
    throw 'relay path failed'
  }
  Write-Host "  relay log: $(Get-Content "$root\.tmp-relay.log" -Raw)"

  Write-Host '== peer via an unreachable address (expect fail) =='
  node docker/wsl-sim/probe-send.mjs 127.0.0.1 59999 fail
  if ($LASTEXITCODE -ne 0) { throw 'unreachable path did not fail as expected' }
  Write-Host '== local wsl-sim OK: relay path round-trips, unreachable address fails as expected =='
} finally {
  Stop-Process -Id $relay.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $recv.Id -Force -ErrorAction SilentlyContinue
  Remove-Item "$root\.tmp-recv.log", "$root\.tmp-recv.err", "$root\.tmp-relay.log", "$root\.tmp-relay.err" -ErrorAction SilentlyContinue
}