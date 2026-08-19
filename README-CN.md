# @rellopn/dsh-p2p-lan

[![npm version](https://img.shields.io/npm/v/@rellopn/dsh-p2p-lan)](https://www.npmjs.com/package/@rellonp/dsh-p2p-lan)
[![License: MIT](https://img.shields.io/npm/l/@rellopn/dsh-p2p-lan)](https://opensource.org/licenses/MIT)

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 的局域网 P2P AI 协作消息插件：同一局域网内不同机器上的 AI 无需中央服务器即可相互发现，并交换纯文本消息（可附带附件）。

单一**双面（dual-face）**插件——**host 端**（`dsh.bundle`）提供 P2P 节点与工具；同包的 `dsh.client` 声明提供浏览器闸门面板。一条 `dsh plugin add` 即可安装全部。

## 特性

- **自动发现** — UDP 组播信标发现，组播被屏蔽时可用手动对端兜底（`manualPeers`）
- **首次接触自动配对** — 开启 `autoAccept` 后，单向 `manualPeers` 入口即成为互连：你的首条消息会携带本机地址，对方自动把你加入 `knownPeers`（无需在另一侧额外配置）
- **能力路由** — 可将消息发给任意声明了匹配标签的在线节点（`send_to_capability`）
- **广播** — 一条消息送达所有对端，带防风暴保护（广播永不自动回复，改为进入人工审核）
- **LLM 自动回复 + 人工闸门** — 在设置里从 dsh 已配置的 LLM 中选择 provider/model 起草回复；闸门偏向可配置（`lenient` / `standard` / `strict`），路由缺失时降级为全部转人工
- **等待回复异步化** — `p2p_send_and_wait` 先短暂同步等待；快速窗口（总超时的一半、封顶 10 秒）内没等到回复即返回 `pending` 并把等待转入后台——最后的回复（或总超时）会自动送回到你的会话，期间你可继续做别的事
- **浏览器闸门面板** — 侧边栏入口（带待审核徽标）、从右侧滑入的**协作抽屉**（不遮住工作区）、批准/编辑/驳回，以及完整的**中英双语**设置面板（热重载、分区可折叠、带动效）
- **附件** — 内容寻址 blob 存储，哈希索引、自动去重（单个附件上限 100 MiB）
- **按项目会话** — 每个 (项目, 同事) 对一条独立会话，命名为 `🤝 来自 <名字> 的协作`
- **可靠性** — 传输 ack、id 去重、退避重试、发件箱/收件箱（AI/人类已读追踪）、死信 + `send-failed`
- **诊断日志** — 独立运行日志 `~/.dsh/p2p-lan.log`，入站/路由/审核/回复每一步可查

## 安装

```bash
dsh plugin --profile web add @rellonp/dsh-p2p-lan
```

或在不发布的情况下，从本地 `dist/` 的 tarball 安装：

```bash
dsh plugin --profile web add ./rellonp-dsh-p2p-lan-<版本>.tgz
```

## 快速开始

bundle 的 `cordis.patch.yml` 会挂载两端。`nodeName` 与 `port` 均可省略——留空会自动生成基于主机名的随机名（如 `desktop-8f2a`），端口被占用时自动顺延到下一个空闲端口：

```yaml
- id: p2p-lan
  name: '@rellonp/dsh-p2p-lan'
  config:
    nodeName: 'backend-a'           # 可选；默认 = 主机名 + 4 位随机（全网唯一）
    capabilities: ['rpc', 'export'] # 可选：这台 AI 能回答什么
```

provider / model 建议在浏览器设置面板里从下拉选择（会自动带出 dsh 已配置的 LLM），也可在此手写：

```yaml
    provider: deepseek-official     # 自动回复用的 LLM 路由；留空=全部转人工
    model: deepseek-v4-flash        # 模型 id
    persona: '后端开发'              # 可选：回复草稿的角色提示
```

## 配置项

所有键均通过 zod schema 校验，并可在浏览器设置面板热重载。

| 键 | 默认值 | 含义 |
|---|---|---|
| `nodeName` | `''`（自动） | 全网唯一的名字；留空自动生成 `主机名-4位随机` 并持久化（重名会被拒绝） |
| `advertisedHost` | `''`（自动） | 广播给对端的地址；留空自动检测局域网地址。WSL2 里配合端口转发时填 Windows 主机的局域网 IP |
| `capabilities` | `[]` | 供 `send_to_capability` 路由使用的能力标签 |
| `autoDiscover` | `true` | UDP 组播发现 |
| `manualPeers` | `[]` | 组播被屏蔽时的 `[{ name, host, port }]` 兜底 |
| `autoAccept` | `true` | 首次接触时自动收下之前未知的对端（其消息携带可达地址），单向 `manualPeers` 即成为互连，无需在另一侧配置 |
| `knownPeers` | `[]` | 首次接触自动学习并本地持久化的对端 `[{ name, host, port }]`（与 `manualPeers` 分开，不受 `manualPeers` 对账影响） |
| `port` | `53420` | 请求的 WebSocket 监听端口；被占用时自动顺延（`port`→`port+199`）并广播真实端口。热重载会等待自己刚释放的端口，不会漂移。设置面板会显示实际使用端口 |
| `sensitivity` | `'standard'` | 闸门偏向：`lenient` / `standard` / `strict` |
| `waitTimeoutSec` | `60` | **等待回复总超时（秒）**。快速窗口（挂起到后台前的等待）自动派生：总超时的一半、封顶 10 秒 |
| `provider` | `''` | 自动回复用的 LLM 路由——在设置面板从 dsh 已配置的 LLM 中选择（留空降级为全部转人工） |
| `model` | `''` | 自动回复用的 LLM 模型（切换 provider 时自动选中其第一个模型） |
| `persona` | `''` | 注入草稿提示词的角色提示 |
| `projects` | `[]` | `[{ name, path, broadcast }]` 按项目会话路由 |
| `debug` | `false` | 设置面板显示插件版本、实时计数器与最近原始 wire JSON 帧（收发） |

## WSL2 / 广播被禁的网络

在禁止组播/广播的网络（公司 VLAN、WSL2、docker 桥接），自动发现无法工作：为每个同事配一条**单向** `manualPeers` 即可。开启 `autoAccept`（默认）后，当你首次给同事发消息，本机广播可达地址、对方**自动把你加进** `knownPeers`——无需手工配置两侧，单个入口即变成互连。（关闭 `autoAccept` 则要求两侧均手工配置。）

dsh 跑在 **WSL2 里**（NAT，独立 172.x 网段）时的做法：

1. **打通入站**：在 Windows 主机上把端口转发进 WSL 并放行防火墙（WSL IP 每次启动会变，需在每次 WSL 启动后执行）：
   ```powershell
   # 在 Windows（管理员 PowerShell）运行；用 `wsl hostname -I` 查 WSL 的 IP
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=53420 connectaddress=<WSL_IP> connectport=53420
   # 保持 WSL IP 最新： wsl hostname -I
   ```
   或在国内 `%UserProfile%\.wslconfig` 开启 `networkingMode=mirrored`（Win11 22H2+），让 WSL 端口与组播自动镜像到 Windows 主机。

2. **只配一侧** `manualPeers`（回复是新发出的出站连接）；开启 `autoAccept` 后，首条消息即完成配对、无需两侧都配——但需保证广播给对方的地址可达：
   - 远端对端：`{ name: 'wsl-node', host: '<Windows局域网IP>', port: 53420 }`
   - WSL 节点用从对方首条消息学到的 `knownPeers` 地址回复；若 WSL 节点先发，需设置 `advertisedHost`（见上）让它的可达地址被携带。

3. **验证**：用自带模拟（docker 桥接本身不转发组播，即广播被禁网络 + 端口代理）：
   ```powershell
   pwsh docker/run-wsl-sim.ps1        # docker：recv <- relay(53421) <- peer
   pwsh docker/wsl-sim/run-local.ps1  # 同拓扑，无需 docker
   ```

## 工具

插件注册了三个模型工具：

| 工具 | 用途 |
|---|---|
| `p2p_send` | 向 LAN 对端发送即发即忘的通知（异步，无回复） |
| `p2p_send_and_wait` | 发送并短暂等待；`waitTimeoutSec` 的快速窗口内返回 `reply`/`timeout`，否则返回 `pending`——等待转入后台，回复/超时会自动送回你的会话（请勿重复发送） |
| `p2p_check_inbox` | 列出 AI 尚未阅读的 LAN 对端消息 |

广播与能力路由就是同一个 `p2p_send` 工具，配 `target.broadcast` / `target.capability`。

## Docker 验证

`docker/` 下提供了可复跑的完整场景套件（真实 WebSocket 传输 + Discovery + Agent，无需真实 LLM——按消息伪造回复行为以覆盖全部代码路径）：

| 套件 | 验证内容 |
|---|---|
| `docker/discover` | 两个 compose 容器间 UDP 组播**自动发现**双向互通 |
| `docker/manual-msg` | 关闭自动发现的两个节点仍可手动 IP:端口互发现，并完成一次真实消息往返 |
| `docker/e2e` | 完整行为矩阵（13 场景）：快速窗口回复 / pending→后台送达 / pending→超时 / 广播审核 / 未知发送者审核 / 项目自动执行 / 项目后台批准 / 编辑回复 / 驳回 / 端口顺延 / 离线排队 |

```bash
docker build -t dsh-p2p-e2e:local -f docker/e2e/Dockerfile.e2e .
docker compose -f docker/e2e/compose.e2e.yml run --rm e2e   # → TOTAL 13/13 passed
```

## 架构

| 模块 | 职责 |
|---|---|
| `src/messages.ts` | `Envelope` 模型、校验（正文/附件上限、拒绝可执行文件）、id 去重 |
| `src/identity.ts` | 节点身份 + 空 `sign`/`verify` 信任缝 |
| `src/config.ts` | 配置 schema + 默认值 |
| `src/discovery.ts` | UDP 组播发现、手动对端、能力索引、重名检测 |
| `src/transport.ts` | WebSocket 服务端/客户端、传输 ack、id 去重、退避重试 |
| `src/store.ts` | 发件箱队列、收件箱（AI/人类已读追踪）、死信 + `send-failed` |
| `src/agent.ts` | 工具（`send` / `send_and_wait` / `check_inbox`）、入站路由、自动回复/闸门引擎、异步等待 + `wait-settled` |
| `src/attachment-store.ts` | 内容寻址附件存储（哈希索引、去重） |
| `src/reply-engine.ts` | LLM 回复草稿 + 闸门决策（失败降级全人工闸门、30s 硬超时防挂起） |
| `src/plugin.ts` | Cordis 插件：`ctx.p2p` 服务（remote 为 `remote.p2p`）、生命周期接线、后台等待结果回投 |
| `src/client/` | 浏览器闸门面板：侧边栏入口 + 协作抽屉 + 双语设置面板 |
| `src/diag-log.ts` | 独立诊断日志 `~/.dsh/p2p-lan.log` |

回复规则：广播永不自动回复（防风暴，改进入工审核）；自动回复链受 `MAX_REPLY_DEPTH`（3）上限约束，超出后强制人工闸门；自动回复必须携带 `replyTo`。

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

## 升级 / 热重载语义

dsh 动态加载插件，但“动态”有明确边界：

- **改配置**（设置面板，或编辑 profile 的 `cordis.patch.yml`）经 Cordis HMR 热生效，无需重启；插件自身的 `applyConfig` 对重量字段也会实时重建节点核心。
- **增删插件行**（`cordis.patch.yml`）同样热生效——Loader 运行时挂载/卸载。
- **升级插件包**（`dsh plugin add <新 .tgz>`）替换 `node_modules` 里的文件，但 Node 会缓存已加载的 ESM 模块，因此新 host 代码要到下次 `dsh` 启动才生效；浏览器端按页加载，刷新即可。简言之：**升级后重启 dsh 进程 + 刷新浏览器标签页**。

## 状态

已发布为 `@rellopn/dsh-p2p-lan@0.1.0-rc.29`。用 `docker/e2e` 行为矩阵（13 场景全部通过）以及对发布包的 `discover`、`manual-msg` compose 套件做了端到端验证；单测 93 条全绿。

## 许可证

基于 [MIT](https://opensource.org/licenses/MIT) 许可证发布。
