# AGENTS.md

> 本文件为 AI 编码助手在本仓库工作时的指南。修改本仓库代码前请先阅读本文。
> This file is a guide for AI coding assistants working in this repository. Read it before making changes.

## 项目简介 / Project Overview

`@rellopn/dsh-p2p-lan` 是 DeepSeek Harness (DSH) 的一个 LAN P2P AI-to-AI 协作消息插件：
让同一局域网内不同机器上的 AI 无需中央服务器即可相互发现、交换纯文本消息（可带附件）。

这是一个**双面（dual-face）单包插件**：

- **host 端**（`dsh.bundle`）：P2P 节点 + 工具（`p2p_send` / `p2p_send_and_wait` / `p2p_check_inbox`）。
- **client 端**（`dsh.client`）：浏览器闸门面板（footer 开关 + floating overlay + 设置面板）。

一条 `dsh plugin --profile web add @rellopn/dsh-p2p-lan` 即可安装全部。

## 仓库结构 / Repository Layout

| 路径 | 职责 |
|---|---|
| `src/messages.ts` | `Envelope` 模型、校验（正文/附件上限、拒绝可执行文件）、id 去重 |
| `src/identity.ts` | 节点身份 + 空 `sign`/`verify` 信任缝 |
| `src/config.ts` | 配置 schema + 默认值（name、capabilities、discovery、peers、sensitivity、timeout） |
| `src/discovery.ts` | UDP 组播发现、手动 peers、capability 索引、重名检测 |
| `src/transport.ts` | WebSocket 服务端/客户端、传输 ack、id 去重、退避重试 |
| `src/store.ts` | 发件箱队列、收件箱（AI/人类已读追踪）、死信 + `send-failed` |
| `src/agent.ts` | 工具（`send`/`send_and_wait`/`check_inbox`）、入站路由、自动回复/闸门引擎 |
| `src/attachment-store.ts` | 内容寻址附件存储（哈希索引、去重） |
| `src/reply-engine.ts` | LLM 回复草稿 + 闸门决策（失败时降级为全人工闸门） |
| `src/plugin.ts` | Cordis 插件：`ctx.p2p` 服务（remote 为 `remote.p2p`）、事件/生命周期接线、3 个模型工具 |
| `src/types.ts` | 纯 wire 类型再导出（供生成的 Remote face 与浏览器包使用） |
| `src/invariant.ts` | 断言/不变式工具 |
| `src/client/` | 浏览器闸门面板：`sidebar.footer.action` 开关 + `shell.overlay` 浮动面板 + 设置面板 |
| `tests/` | 每个模块对应的 vitest 测试（`tests/*.spec.ts`） |
| `scripts/` | `gen-typert.mjs`（见下方守则）、`platform.ts`、`tsdown.client.ts`（client 构建配置） |
| `docker/` | 双机（双容器）端到端 demo：Dockerfile、entrypoint、probe 脚本、`run-demo.ps1` |
| `lib/` | **生成产物**：host/client 构建输出 + 手工同步的 Typert 文件（勿手改，见守则） |
| `dist/` | `pnpm pack` 产物（`.tgz`） |

## 常用命令 / Common Commands

```bash
pnpm install          # 安装依赖（pnpm@11.7.0）
pnpm build            # 全量构建：host（tsc -b tsconfig.host.json + tsdown）→ client（tsc -b tsconfig.client.json + tsdown）
pnpm build:host       # 只构建 host 端
pnpm build:client     # 只构建 client 端
pnpm test             # 运行全部 vitest 测试（tests/**/*.spec.ts）
pnpm pack             # 打包出 .tgz（发布或本地分享用）
```

修改代码后至少运行 `pnpm test`；改动涉及双面时运行 `pnpm build` 验证两端都能编译。

## 关键守则 / Guardrails

1. **Typert 生成文件必须手工同步，不要用脚本/工具重写。**
   `lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/typert.remote-client.d.ts` 是检入仓库的产物。
   上游 Typert 生成器在本仓库无法解析 `@Remote`（`@deepseek-ai/dsh-typert-protocol` 是外部依赖而非 workspace 包），
   `scripts/gen-typert.mjs` 当前会报 "has no Remote methods"。**在 `src/plugin.ts` 增删 `@Remote` 方法后，
   手工同步这三个文件**：每个新/改返回类型加 zod schema、加 invocation/descriptor 条目、更新 d.ts 签名（参照脚本头注释）。
   除此之外不要手改 `lib/` 下的生成文件。

2. **client 端自挂载 `remote.p2p` 命名空间**，不需要改 api-remotes 配置。

3. **回复规则（防消息风暴）：**
   - 广播（`broadcast` 目标）永远不自动回复；
   - 自动回复链受 `MAX_REPLY_DEPTH` 上限约束，超出后强制人工闸门；
   - 自动回复必须携带 `replyTo`；
   - `broadcast` / `send_to_capability` 就是 `agent.send` 配 `broadcast` / `capability` 目标。

4. **配置键有 schema 校验且热重载**（nodeName、capabilities、autoDiscover、manualPeers、port、sensitivity、
   sendWaitTimeoutMs、provider、model、persona）。新增配置键要同时更新 `src/config.ts` 的 schema/默认值
   和 `src/client/P2PSettingsSection.tsx` 的设置面板（如适用）。

5. **遵循现有模块边界**：每个 `src/*.ts` 单模块单职责，通过导出接口通信；别把新逻辑塞进已有大文件（如 `plugin.ts`）。
   参照 README「Modules」表的职责划分。

6. **测试与验证**：单测用 vitest（`tests/*.spec.ts`，`vitest.config.ts` 已配置 include）。双机端到端验证用
   `docker/`（docker compose + `run-demo.ps1`）。改传输/发现逻辑时请保持/补充对应 spec。

7. **提交纪律**：`lib/` 生成文件与源码一起检入是预期行为（npm 包 `files` 字段引用它们），但它们的改动
   必须来自构建或上述手工同步流程，不要提交中间态。

## 发布 / Publishing

```bash
pnpm build   # 1. 构建双面
pnpm pack    # 2. 打包
npm publish  # 3. 发布到 @rellopn scope（需 npm login + scope 权限）
```

或本地分享 tarball：`dsh plugin --profile web add ./rellopn-dsh-p2p-lan-<version>.tgz`。

## 更多信息 / Further Reading

- `README.md`：模块表、安装示例、per-machine 配置模板（`nodeName` 必须全网唯一）。
- `cordis.patch.yml`：bundle patch 模板（一行挂载 host + client 两端）。
