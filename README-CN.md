# @rellopn/dsh-p2p-lan

[![npm version](https://img.shields.io/npm/v/@rellopn/dsh-p2p-lan)](https://www.npmjs.com/package/@rellopn/dsh-p2p-lan)
[![License: MIT](https://img.shields.io/npm/l/@rellopn/dsh-p2p-lan)](https://opensource.org/licenses/MIT)

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 的局域网 P2P AI 协作消息插件：同一局域网内不同机器上的 AI 无需中央服务器即可相互发现，并交换纯文本消息（可附带附件）。

单一**双面（dual-face）**插件——**host 端**（`dsh.bundle`）提供 P2P 节点与工具；同包的 `dsh.client` 声明提供浏览器闸门面板。一条 `dsh plugin add` 即可安装全部。

## 特性

- **自动发现** — UDP 组播信标发现，组播被屏蔽时可用手动对端兜底（`manualPeers`）
- **能力路由** — 可将消息发给任意声明了匹配标签的在线节点（`send_to_capability`）
- **广播** — 一条消息送达所有对端，带防风暴保护（广播永不自动回复）
- **LLM 自动回复 + 人工闸门** — 通过配置的 `provider`/`model` 起草回复；闸门偏向可配置（`lenient` / `standard` / `strict`），未配置 LLM 时降级为全部转人工
- **浏览器闸门面板** — 侧边栏开关（带待审徽标）、可批准/编辑/拒绝的浮动面板、完整设置面板（热重载）
- **附件** — 内容寻址 blob 存储，哈希索引、自动去重（单个附件上限 100 MiB）
- **按项目会话** — 提到项目名的普通消息自动路由，并复用每个项目的 agent 会话
- **可靠性** — 传输 ack、id 去重、退避重试、发件箱/收件箱（AI/人类已读追踪）、死信 + `send-failed`

## 安装

```bash
dsh plugin --profile web add @rellopn/dsh-p2p-lan
```

或在不发布的情况下，从本地 tarball 安装：

```bash
dsh plugin --profile web add ./rellopn-dsh-p2p-lan-0.1.0-rc.6.tgz
```

## 快速开始

bundle 的 `cordis.patch.yml` 会挂载两端。按机器修改——`nodeName` 必须在全网唯一：

```yaml
- id: p2p-lan
  name: '@rellopn/dsh-p2p-lan'
  config:
    nodeName: 'backend-a'           # 全网唯一（每台机器不同）
    capabilities: ['rpc', 'export'] # 可选：这台 AI 能回答什么
    provider: deepseek-official     # 自动回复用的 LLM 路由；留空=全部转人工
    model: deepseek-v4-flash        # 模型 id
    persona: '后端开发'              # 可选：回复草稿的角色提示
```

## 配置项

所有键均通过 zod schema 校验，并可在浏览器设置面板热重载。

| 键 | 默认值 | 含义 |
|---|---|---|
| `nodeName` | `'unnamed'` | 本节点全网唯一的名字（重名会被拒绝） |
| `capabilities` | `[]` | 供 `send_to_capability` 路由使用的能力标签 |
| `autoDiscover` | `true` | UDP 组播发现 |
| `manualPeers` | `[]` | 组播被屏蔽时的 `[{ name, host, port }]` 兜底 |
| `port` | `53420` | WebSocket 监听端口 |
| `sensitivity` | `'standard'` | 闸门偏向：`lenient` / `standard` / `strict` |
| `sendWaitTimeoutMs` | `300000` | 同步等待回复的超时（毫秒） |
| `provider` | `''` | 回复草稿用的 LLM 路由（留空降级为全部转人工） |
| `model` | `''` | 回复草稿用的 LLM 模型 |
| `persona` | `''` | 注入草稿提示词的角色提示 |
| `projects` | `[]` | `[{ name, path, broadcast }]` 按项目会话路由 |

## 工具

插件注册了三个模型工具：

| 工具 | 用途 |
|---|---|
| `p2p_send` | 向 LAN 对端发送即发即忘的通知（异步，无回复） |
| `p2p_send_and_wait` | 发送并阻塞，直到对端回复或超时 |
| `p2p_check_inbox` | 列出 AI 尚未阅读的 LAN 对端消息 |

广播与能力路由就是同一个 `p2p_send` 工具，配 `target.broadcast` / `target.capability`。

## 架构

| 模块 | 职责 |
|---|---|
| `src/messages.ts` | `Envelope` 模型、校验（正文/附件上限、拒绝可执行文件）、id 去重 |
| `src/identity.ts` | 节点身份 + 空 `sign`/`verify` 信任缝 |
| `src/config.ts` | 配置 schema + 默认值 |
| `src/discovery.ts` | UDP 组播发现、手动对端、能力索引、重名检测 |
| `src/transport.ts` | WebSocket 服务端/客户端、传输 ack、id 去重、退避重试 |
| `src/store.ts` | 发件箱队列、收件箱（AI/人类已读追踪）、死信 + `send-failed` |
| `src/agent.ts` | 工具（`send` / `send_and_wait` / `check_inbox`）、入站路由、自动回复/闸门引擎 |
| `src/attachment-store.ts` | 内容寻址附件存储（哈希索引、去重） |
| `src/reply-engine.ts` | LLM 回复草稿 + 闸门决策（失败时降级为全人工闸门） |
| `src/plugin.ts` | Cordis 插件：`ctx.p2p` 服务（remote 为 `remote.p2p`）、生命周期接线 |
| `src/client/` | 浏览器闸门面板：侧边栏开关 + 浮动面板 + 设置面板 |

回复规则：广播永不自动回复（防风暴）；自动回复链受 `MAX_REPLY_DEPTH`（3）上限约束，超出后强制人工闸门；自动回复必须携带 `replyTo`。

## 开发

```bash
pnpm install   # pnpm@11.7.0
pnpm build     # 先 host（tsc + tsdown）再 client（tsc + tsdown）
pnpm test      # vitest（tests/**/*.spec.ts）
pnpm pack      # 产出 .tgz，供 dsh plugin add / npm publish 使用
```

发布到 `@rellopn` scope：`pnpm build` → `pnpm pack` → `npm publish`。

> **注意：** `lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/typert.remote-client.d.ts` 是检入仓库的生成产物。上游 Typert 生成器在本仓库无法解析 `@Remote`（协议包是外部依赖），因此在 `src/plugin.ts` 增删 `@Remote` 方法后，需手工同步这三个文件（见 `scripts/gen-typert.mjs`）。

完整的仓库开发指南见 [AGENTS.md](AGENTS.md)。

## 状态

已发布为 `@rellopn/dsh-p2p-lan@0.1.0-rc.6`，并通过双机（双容器）局域网端到端验证：发送方节点 A 调用 `p2p_send_and_wait`，收到了接收方节点 B 的 LLM 起草回复。

## 许可证

基于 [MIT](https://opensource.org/licenses/MIT) 许可证发布。
