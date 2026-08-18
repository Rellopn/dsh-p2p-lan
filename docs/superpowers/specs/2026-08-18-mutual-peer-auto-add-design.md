# 双向自动互加（mutual peer auto-add）设计

日期：2026-08-18
状态：已获用户批准（不含 proactive hello 扩展）

## 目标

在组播被封的网络（公司 VLAN / WSL2 / docker bridge）上，让"链接同事"从
"两边都要手动填 `manualPeers`"简化为**单侧配置**：

- 我在 `manualPeers` 里只填对方；
- 我方首次连上对方并发送消息时，把自己**可达的 advertised 地址**随消息带过去；
- 对方收到后**自动把本站持久化为它的 peer**（含回信地址），并受 `autoAccept`
  开关控制（默认开）。

效果：**你加了他，他自动把你加上**；双向互通，他侧零手动配置。

## 范围

- 只做"发消息时自动互加"；**proactive hello（把对端加进 manualPeers 的那一刻立即互加）
  明确排除**，留作后续。
- 不扩展现有 `sign`/`verify` 信任缝（仍为空信任模型）。

## 设计

### 1. 线协议：`Envelope.from` 携带发信方可达地址

- `types.ts` 的 `PeerRef` 增可选字段 `host?: string; port?: number`；
  `Envelope.from` 是 `PeerRef`，随之携带。
- `messages.ts` 的 `validateEnvelope` 增可选校验：
  - `from.host` 若存在必须是 `string`；
  - `from.port` 若存在必须是 `number`。
- `Envelope` 是 `@Remote` 返回类型（`checkInbox` 返回 `Envelope[]`），**按仓库守则手工同步**
  `lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/typert.remote-client.d.ts`
  三个生成文件（增 zod schema / invocation 条目 / d.ts 签名）。

### 2. 出站：`newEnvelope` 带上本节点广告地址

- `Agent` 目前只知道 `identity{id,name}`。注入"本节点可达地址"
  （= `plugin.ts` 已算好的 `lanHost` + `transport.effectivePort()`）：
  - 构造参数或 `setAdvertised(host, port)` 访问器；
  - 保存为字段。
- `newEnvelope`（请求与回复共用，`agent.ts:326`）构造 `from` 时写为
  `{id, name, host, port}`。请求和回复都会携带，对端总能学到最新地址。

### 3. 入站自动接受 + 持久化（核心）

在 `plugin.ts` 的 `transport.on('envelope')` 里、交给 `agent.handleInbound`
**之前**，新增 `learnInboundPeer(envelope)`：

- `autoAccept` 关闭 → 跳过（维持现状）。
- `envelope.from.id` 是自己 → 跳过。
- `from.host/port` 有效 且 该 peer 未在目录 → upsert 进 `Discovery` 为**持久 peer**，
  并合并写回本站 `knownPeers` 配置（`configPersist`，按 name 去重）。

结果：对方目录立刻有了本站地址 → `handleInbound` 的 `resolvePeer` 命中 →
**能自动/闸门回信**，且本站永久挂在对方 peer 表。

### 4. 配置 + 设置面板

- 新配置键 **`autoAccept: boolean`**，默认 `true`。
- 新配置键 **`knownPeers: ManualPeer[]`**（`{name,host,port}`），与 `manualPeers` 分开：
  - `manualPeers` = 操作者手配，参与 `setManualPeers` 对账清理；
  - `knownPeers` = 自动回填，同样持久、不参与 sweep，但**不受手配对账清理**。
- `Discovery` 增 `setKnownPeers` + `learnPeer`（学习单个 peer 并持久化归口）。
- 设置面板 `P2PSettingsSection.tsx`：
  - `autoAccept` 开关；
  - `knownPeers` 列表（只读展示 + 删除按钮，删除回写 `setConfig`）。
- 两侧 `Config`（`src/config.ts` / `src/types.ts`）+ 插件 `Config`/`SettingsSchema`
  schema 同步。

### 5. 边界与信任

- **时效**：对方已离线时，其 `knownPeers` 里的本站仍在目录（持久），发信进 outbox
  排队，与 manual 一致。
- **地址漂移**：换 IP 后，对方下一条消息的新地址会刷新本站 entry。
- **安全**：`autoAccept` 默认开 = "能连上你的节点即互加"，与现有"任何能连上即被处理"
  的信任边界一致；关掉回到全手动。
- **WSL 局限**：发送方若在 WSL 且未设 `advertisedHost`，带过去的可能是内部 172.x
  地址，对方连不上——沿用 README 的"WSL 侧设 advertisedHost"。

## 测试

- send 时 `from` 携带本节点 host/port。
- 入站自动接受：未知发送方携有效地址 → 学习为持久 peer 并持久化 `knownPeers`。
- `autoAccept=false` 时入站不自动加（维持现状）。
- `validateEnvelope` 接受 `from.host`/`from.port` 新字段。
- `knownPeers` 配置保存/重载后不被清空、不同名条目不去重冲突。

## 文档

- README 配置表增 `autoAccept` / `knownPeers`。
- 更新 WSL2 一节 "every node must be wired with `manualPeers` on both sides"
  的表述为"单侧配置 + 首次接触自动互加"。

## 不做（后续可选）

- proactive hello：把对端加进 manualPeers 的那一刻立即互加，不必等第一条消息。
