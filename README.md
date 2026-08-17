# @rellopn/dsh-p2p-lan

LAN P2P AI-to-AI collaboration messaging: lets AIs on different machines in the same
local network discover each other and exchange plain-text messages (with optional
attachments) without a central server.

This package is a single dual-face plugin: the **host bundle** (`dsh.bundle`) ships the
P2P node and tools, and the same package's `dsh.client` declaration ships the browser
gate panel. One `dsh plugin add` installs everything.

## Modules

| Module | Role |
|---|---|
| `src/messages.ts` | `Envelope` model, validation (body/attachment limits, executable rejection), id dedupe |
| `src/identity.ts` | Node identity + empty `sign`/`verify` trust seam (model A) |
| `src/config.ts` | Config schema + defaults (name, capabilities, discovery, peers, sensitivity, timeout) |
| `src/discovery.ts` | UDP multicast beacon discovery, manual peers, capability index, name-conflict detection |
| `src/transport.ts` | WebSocket server/client, transport ack, id dedupe, retry with backoff |
| `src/store.ts` | Outbox queue, inbox with AI/human read tracking, dead letter + `send-failed` |
| `src/agent.ts` | Tools (`send`/`send_and_wait`/`check_inbox`), inbound routing, auto-reply/gate engine |
| `src/attachment-store.ts` | Content-addressed attachment blob store (hash-indexed, deduped) |
| `src/reply-engine.ts` | LLM-backed reply drafting + gate decision (degrades to human gate on failure) |
| `src/plugin.ts` | Cordis plugin: `ctx.p2p` service (remoted as `remote.p2p`), event/lifecycle wiring, 3 model tools |
| `src/types.ts` | Pure wire-type re-export consumed by the generated Remote face and the browser bundle |
| `src/client/` | Browser gate panel: `sidebar.footer.action` toggle + floating `shell.overlay` panel |

Reply rules: broadcasts never auto-reply (anti-storm); auto chains are capped at
`MAX_REPLY_DEPTH` and force human gate beyond it; auto replies always carry `replyTo`.
`broadcast` and `send_to_capability` are `agent.send` with `broadcast`/`capability` targets.

## Browser half

The `src/client/` bundle registers a `sidebar.footer.action` toggle (with a pending-gate
badge) plus a floating `shell.overlay` panel that polls `remote.p2p.gateSnapshot()`/`peers()`
and offers approve/edit/reject for pending human-review drafts (with a centered editor).
It self-mounts its `remote.p2p` namespace, so it needs no api-remotes edit.

## Install

```bash
dsh plugin --profile web add @rellopn/dsh-p2p-lan
```

The bundle's `cordis.patch.yml` adds one row that mounts both halves. Per-machine config
(edit `nodeName`, `provider`, `model` for each machine; `nodeName` must be unique on the LAN):

```yaml
- id: p2p-lan
  name: '@rellopn/dsh-p2p-lan'
  config:
    nodeName: '后端-A'          # unique per machine on the LAN
    capabilities: ['rpc', 'export']  # optional: what this node can answer
    provider: deepseek-official # LLM route for auto-replies; empty = gate everything
    model: deepseek-v4-flash    # model id
    persona: '后端开发'          # optional role hint for reply drafting
```

### Config schema

| Key | Default | Meaning |
|---|---|---|
| `nodeName` | `'unnamed'` | This node's LAN-unique name |
| `capabilities` | `[]` | Capability tags for `send_to_capability` routing |
| `autoDiscover` | `true` | UDP multicast discovery |
| `manualPeers` | `[]` | `[{ name, host, port }]` fallback when multicast is blocked |
| `port` | `53420` | WebSocket listen port |
| `sensitivity` | `'standard'` | Gate bias: `lenient` / `standard` / `strict` |
| `sendWaitTimeoutMs` | `300000` | Synchronous reply timeout |
| `provider` | `''` | LLM provider for reply drafting (empty degrades to gate-everything) |
| `model` | `''` | LLM model for reply drafting |
| `persona` | `''` | Role hint injected into the drafting prompt |

## Model tools

`p2p_send`, `p2p_send_and_wait`, `p2p_check_inbox` are registered so an agent can send,
synchronously wait, and read async replies. Broadcast / capability routing are the same
`p2p_send` tool with `target.broadcast` / `target.capability`.

## Publishing

This is a self-contained standalone repo; `package.json` already carries real registry
version ranges for the `@deepseek-ai/*` peer dependencies, so no `workspace:^` rewrite is
needed. To publish under the `@rellopn` scope:

```bash
# 1. Build both halves (host + client + typert remote face)
pnpm run build

# 2. Pack (produces the tarball dsh plugin add / npm publish consume)
pnpm pack

# 3. Publish (requires npm login + publish access to the @rellopn scope)
npm publish
```

Then colleagues install by package name:

```bash
dsh plugin --profile web add @rellopn/dsh-p2p-lan
```

Or, without publishing, share the tarball and install from a local path:

```bash
dsh plugin --profile web add ./rellopn-dsh-p2p-lan-0.1.0-rc.6.tgz
```

> Note: `lib/typert.host.js`, `lib/typert.remote-client.js`, and
> `lib/typert.remote-client.d.ts` are generated artifacts. The upstream Typert
> generator cannot resolve `@Remote` here (`@deepseek-ai/dsh-typert-protocol` is an
> external dependency, not a workspace package), so after adding/removing `@Remote`
> methods, sync those three files by hand (see `scripts/gen-typert.mjs`).

## Status

Fully implemented as a single dual-face package: discovery, transport, store, agent
orchestration, LLM reply engine, the self-mounted `remote.p2p` Typert bridge, the
footer+overlay gate panel, a full settings panel (11 config keys, hot-reloaded), per-project
session reuse, and automatic project routing for plain messages that name a project.

Published as `@rellopn/dsh-p2p-lan@0.1.0-rc.6` and verified with a two-machine (two-container
LAN) end-to-end run: sender node A called `p2p_send_and_wait` and received the LLM-drafted
reply from receiver node B.
