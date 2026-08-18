# @rellopn/dsh-p2p-lan

[![npm version](https://img.shields.io/npm/v/@rellopn/dsh-p2p-lan)](https://www.npmjs.com/package/@rellopn/dsh-p2p-lan)
[![License: MIT](https://img.shields.io/npm/l/@rellopn/dsh-p2p-lan)](https://opensource.org/licenses/MIT)

English | [中文](README-CN.md)

LAN P2P AI-to-AI collaboration messaging for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): AIs on different machines in the same local network discover each other and exchange plain-text messages (with optional attachments) without a central server.

A single **dual-face** plugin — the **host bundle** (`dsh.bundle`) ships the P2P node and tools, and the same package's `dsh.client` declaration ships the browser gate panel. One `dsh plugin add` installs everything.

## Features

- **Automatic discovery** — UDP multicast beacon discovery, plus a manual-peer fallback (`manualPeers`) when multicast is blocked
- **Capability routing** — address a message to any online node that declares a matching tag (`send_to_capability`)
- **Broadcast** — one message to every peer, with anti-storm protection (broadcasts never auto-reply)
- **LLM auto-reply with a human gate** — drafts replies through your configured `provider`/`model`; gate bias is configurable (`lenient` / `standard` / `strict`) and degrades to gate-everything when no LLM is configured
- **Browser gate panel** — sidebar toggle with a pending-gate badge, a floating overlay with approve/edit/reject, and a full settings panel (hot-reloaded)
- **Attachments** — content-addressed blob store, hash-indexed and deduplicated (up to 100 MiB per attachment)
- **Per-project sessions** — plain messages that name a project route automatically, with reused per-project agent sessions
- **Reliability** — transport ack, id dedupe, retry with backoff, outbox/inbox with AI/human read tracking, dead-letter + `send-failed`

## Installation

```bash
dsh plugin --profile web add @rellopn/dsh-p2p-lan
```

Or, without publishing, install from a local tarball:

```bash
dsh plugin --profile web add ./rellopn-dsh-p2p-lan-0.1.0-rc.6.tgz
```

## Quick start

The bundle's `cordis.patch.yml` mounts both halves. `nodeName` and `port` are optional — when left empty/unset the plugin generates a host-scoped random name (e.g. `desktop-8f2a`) and, if the requested port is busy (several dsh on one machine), automatically walks to the next free port:

```yaml
- id: p2p-lan
  name: '@rellopn/dsh-p2p-lan'
  config:
    nodeName: 'backend-a'           # optional; default = hostname + 4 random chars (LAN-unique per machine)
    capabilities: ['rpc', 'export'] # optional: what this node can answer
    provider: deepseek-official     # LLM route for auto-replies; empty = gate everything
    model: deepseek-v4-flash        # model id
    persona: 'backend developer'    # optional role hint for reply drafting
```

## Configuration

All keys are validated by a zod schema and hot-reloaded from the browser settings panel.

| Key | Default | Meaning |
|---|---|---|
| `nodeName` | `''` (auto) | LAN-unique node name; empty generates `hostname-<4 random>` once and persists it (duplicates are rejected) |
| `advertisedHost` | `''` (auto) | Host advertised to peers; empty auto-detects the LAN address. WSL2: set your Windows host's LAN IP when exposing the node via a port-forward |
| `capabilities` | `[]` | Capability tags for `send_to_capability` routing |
| `autoDiscover` | `true` | UDP multicast discovery |
| `manualPeers` | `[]` | `[{ name, host, port }]` fallback when multicast is blocked |
| `port` | `53420` | Requested WebSocket listen port; when busy the plugin binds the next free port (`port`→`port+199`) and advertises the real one. A hot-reload's own closing server is waited out first, so the port does not drift. The settings panel shows the actual port in use |
| `sensitivity` | `'standard'` | Gate bias: `lenient` / `standard` / `strict` |
| `sendWaitTimeoutMs` | `300000` | Synchronous reply timeout (ms) |
| `provider` | `''` | LLM provider for reply drafting (empty degrades to gate-everything) |
| `model` | `''` | LLM model for reply drafting |
| `persona` | `''` | Role hint injected into the drafting prompt |
| `projects` | `[]` | `[{ name, path, broadcast }]` per-project session routing |
| `debug` | `false` | Settings panel shows the plugin version, live counters, and the last raw wire JSON frames (in/out) |

## WSL2 / broadcast-disabled networks

On networks that block multicast/broadcast (company VLANs, WSL2, docker bridge
networks), auto-discovery cannot work: **every node must be wired with
`manualPeers` on both sides.** There is no way around it — discovery is UDP
multicast only.

For a dsh running **inside WSL2** (NAT, own 172.x network):

1. **Expose it inbound**: on the Windows host, forward a port into WSL and allow
   it through the firewall (do this once per WSL boot, WSL IPs change):
   ```powershell
   # run in Windows (admin PowerShell); find the WSL IP with `wsl hostname -I`
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=53420 connectaddress=<WSL_IP> connectport=53420
   # keep the WSL IP current:  wsl hostname -I
   ```
   Or enable `networkingMode=mirrored` in `%UserProfile%\.wslconfig` (Win11 22H2+),
   which mirrors WSL ports and multicast onto the Windows host automatically.

2. **Configure both sides** with `manualPeers` — replies are new outbound
   connections, so each node must know the other's address:
   - On the remote peer: `{ name: 'wsl-node', host: '<Windows-LAN-IP>', port: 53420 }`
   - On the WSL node: `{ name: 'remote', host: '<remote-LAN-IP>', port: 53420 }`
   - Optionally set `advertisedHost: '<Windows-LAN-IP>'` on the WSL node so any
     node that *can* receive its announce learns the reachable address.

3. **Verify** with the included simulation (docker bridge already blocks
   multicast, i.e. it is a broadcast-disabled network with a port-proxy relay):
   ```powershell
   pwsh docker/run-wsl-sim.ps1     # docker: recv <- relay(53421) <- peer
   pwsh docker/wsl-sim/run-local.ps1  # same topology, no docker needed
   ```

## Tools

The plugin registers three model tools:

| Tool | Purpose |
|---|---|
| `p2p_send` | Send a fire-and-forget notification to a LAN peer (async, no reply) |
| `p2p_send_and_wait` | Send and block until the peer replies or the timeout elapses |
| `p2p_check_inbox` | List LAN peer messages the AI has not read yet |

Broadcast and capability routing are the same `p2p_send` tool with `target.broadcast` / `target.capability`.

## Architecture

| Module | Role |
|---|---|
| `src/messages.ts` | `Envelope` model, validation (body/attachment limits, executable rejection), id dedupe |
| `src/identity.ts` | Node identity + empty `sign`/`verify` trust seam |
| `src/config.ts` | Config schema + defaults |
| `src/discovery.ts` | UDP multicast discovery, manual peers, capability index, name-conflict detection |
| `src/transport.ts` | WebSocket server/client, transport ack, id dedupe, retry with backoff |
| `src/store.ts` | Outbox queue, inbox with AI/human read tracking, dead letter + `send-failed` |
| `src/agent.ts` | Tools (`send` / `send_and_wait` / `check_inbox`), inbound routing, auto-reply/gate engine |
| `src/attachment-store.ts` | Content-addressed attachment blob store (hash-indexed, deduped) |
| `src/reply-engine.ts` | LLM-backed reply drafting + gate decision (degrades to human gate on failure) |
| `src/plugin.ts` | Cordis plugin: `ctx.p2p` service (remoted as `remote.p2p`), lifecycle wiring |
| `src/client/` | Browser gate panel: sidebar toggle + floating overlay + settings panel |

Reply rules: broadcasts never auto-reply (anti-storm); auto-reply chains are capped at `MAX_REPLY_DEPTH` (3) and force a human gate beyond it; auto replies always carry `replyTo`.

## Development

```bash
pnpm install   # pnpm@11.7.0
pnpm build     # host (tsc + tsdown) then client (tsc + tsdown)
pnpm test      # vitest (tests/**/*.spec.ts)
pnpm pack      # produce the .tgz consumed by dsh plugin add / npm publish
```

To publish under the `@rellopn` scope: `pnpm build` → `pnpm pack` → `npm publish`.

> **Note:** `lib/typert.host.js`, `lib/typert.remote-client.js`, and `lib/typert.remote-client.d.ts` are checked-in generated artifacts. The upstream Typert generator cannot resolve `@Remote` in this repo (the protocol package is an external dependency), so after adding/removing `@Remote` methods in `src/plugin.ts`, sync those three files by hand (see `scripts/gen-typert.mjs`).

See [AGENTS.md](AGENTS.md) for the full repository guide for AI coding assistants.

## Status

Published as `@rellopn/dsh-p2p-lan@0.1.0-rc.6` and verified with a two-machine (two-container) LAN end-to-end run: sender node A called `p2p_send_and_wait` and received the LLM-drafted reply from receiver node B.

## License

Released under the [MIT](https://opensource.org/licenses/MIT) license.
