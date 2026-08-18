/**
 * Browser-face i18n for the p2p gate panel. Declares the `p2p` locale
 * namespace (bilingual zh/en, enforced at registration) and ships both
 * dictionaries. Components opt in via slot registration `locale: 'p2p'`, which
 * puts the typed `t` seat on their props.
 * @module @rellopn/dsh-p2p-lan
 */

import type { LocaleDictOf } from '@deepseek-ai/dsh-client-ui-slots'

export const P2P_NS = 'p2p'

/** The dictionary key union for this package's UI copy. */
export type P2PKey =
  | 'footer.label'
  | 'settings.sectionLabel'
  | 'overlay.title'
  | 'overlay.titleGates'
  | 'overlay.noPeers'
  | 'overlay.peerProjects'
  | 'overlay.inbox'
  | 'overlay.inboxMessage'
  | 'overlay.editReplyTitle'
  | 'overlay.cancel'
  | 'overlay.send'
  | 'overlay.from'
  | 'overlay.fromProject'
  | 'overlay.aiDraft'
  | 'overlay.aiFailed'
  | 'overlay.unknownSender'
  | 'overlay.approve'
  | 'overlay.edit'
  | 'overlay.reject'
  | 'overlay.emptyReplyNotice'
  | 'settings.version'
  | 'settings.listening'
  | 'settings.notRunning'
  | 'settings.sep'
  | 'settings.nodeName'
  | 'settings.nodeNameHint'
  | 'settings.advertisedHost'
  | 'settings.advertisedHostPlaceholder'
  | 'settings.advertisedHostHint'
  | 'settings.capabilities'
  | 'settings.capabilitiesPlaceholder'
  | 'settings.capabilitiesHint'
  | 'settings.autoDiscover'
  | 'settings.autoDiscoverLabel'
  | 'settings.manualPeers'
  | 'settings.manualName'
  | 'settings.manualHost'
  | 'settings.manualPort'
  | 'settings.remove'
  | 'settings.addManualPeer'
  | 'settings.port'
  | 'settings.portHintRebind'
  | 'settings.portBusy'
  | 'settings.portOk'
  | 'settings.sensitivity'
  | 'settings.sensitivityLenient'
  | 'settings.sensitivityStandard'
  | 'settings.sensitivityStrict'
  | 'settings.sendWaitTimeout'
  | 'settings.llmRoute'
  | 'settings.providerPlaceholder'
  | 'settings.modelPlaceholder'
  | 'settings.llmRouteHint'
  | 'settings.persona'
  | 'settings.personaPlaceholder'
  | 'settings.save'
  | 'settings.saving'
  | 'settings.saved'
  | 'settings.saveFailed'
  | 'settings.debug'
  | 'settings.debugLabel'
  | 'settings.debugSummary'
  | 'settings.debugCounts'
  | 'settings.refreshDebug'
  | 'settings.debugNoFrames'
  | 'settings.projectsTitle'
  | 'settings.projectsHint'
  | 'settings.noProjects'
  | 'settings.projectNamePlaceholder'
  | 'settings.projectPathPlaceholder'
  | 'settings.broadcast'
  | 'settings.addProject'
  | 'settings.importWorkspaces'
  | 'settings.importing'
  | 'settings.imported'
  | 'settings.noneToImport'
  | 'settings.workspacesUnavailable'
  | 'settings.importFailed'
  | 'settings.loading'
  | 'settings.configUnavailable'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    p2p: P2PKey
  }
}

/** Typed helper: a complete p2p dictionary. */
export type P2PDict = LocaleDictOf<'p2p'>

export const zh: P2PDict = {
  'footer.label': '协作',
  'settings.sectionLabel': '协作',
  'overlay.title': '协作',
  'overlay.titleGates': '协作 · 待审核 {count}',
  'overlay.noPeers': '无在线同事',
  'overlay.peerProjects': '（{projects}）',
  'overlay.inbox': '收件箱',
  'overlay.inboxMessage': '{from}：{body}',
  'overlay.editReplyTitle': '编辑回复',
  'overlay.cancel': '取消',
  'overlay.send': '发送',
  'overlay.from': '来自 {name}',
  'overlay.fromProject': '来自 {name} · 项目 {project}',
  'overlay.aiDraft': 'AI 起草：',
  'overlay.aiFailed': 'AI 未能起草回复（provider 未配置或调用失败）。请点击「编辑」填写回复后再发送，空回复会被拒绝。',
  'overlay.unknownSender': '发送者不在节点目录（未发现/未添加手动节点），回复可能无法送达——请先在设置中将其加入「手动节点」。',
  'overlay.approve': '批准',
  'overlay.edit': '编辑',
  'overlay.reject': '驳回',
  'overlay.emptyReplyNotice': '回复为空，已被拒绝发送——请填写内容后再发送。',
  'settings.version': '插件版本 {version}',
  'settings.listening': '监听 {port}',
  'settings.notRunning': '未运行',
  'settings.sep': ' · ',
  'settings.nodeName': '节点名称',
  'settings.nodeNameHint': '全网唯一；改名会重建节点身份（进程不重启，但收件箱/发件箱会重置）。',
  'settings.advertisedHost': '对外宣告 IP（可选）',
  'settings.advertisedHostPlaceholder': '留空 = 自动检测局域网地址',
  'settings.advertisedHostHint': '广播给同事的连接地址，只影响别人连你。WSL2 里跑 dsh 时填 Windows 主机的局域网 IP（如 10.0.0.8），配合端口转发让同事能连进来；留空则自动检测。',
  'settings.capabilities': '能力标签（逗号分隔）',
  'settings.capabilitiesPlaceholder': 'rpc, export',
  'settings.capabilitiesHint': '供同事用「按能力路由」找到本机。',
  'settings.autoDiscover': '自动发现（UDP 组播）',
  'settings.autoDiscoverLabel': '开启（组播被禁的环境请关闭并用下面的手动节点）',
  'settings.manualPeers': '手动节点（组播被禁时的 fallback）',
  'settings.manualName': '名称',
  'settings.manualHost': 'host',
  'settings.manualPort': 'port',
  'settings.remove': '删除',
  'settings.addManualPeer': '＋ 添加手动节点',
  'settings.port': '传输端口',
  'settings.portHintRebind': '改端口会重启 WebSocket server（进程不重启）。',
  'settings.portBusy': '请求的 {requested} 被占用，当前实际监听 {effective}（将广播给局域网同事）。',
  'settings.portOk': '当前实际监听 {effective}；端口被占用时插件会自动顺延到下一个空闲端口（自己刚释放的端口会被等待回收，不会漂移）。',
  'settings.sensitivity': '自动回复把关灵敏度',
  'settings.sensitivityLenient': '宽松（拿不准就自动回复）',
  'settings.sensitivityStandard': '标准（正式/有风险才转人工）',
  'settings.sensitivityStrict': '严格（一律转人工把关）',
  'settings.sendWaitTimeout': '同步等待回复超时（毫秒）',
  'settings.llmRoute': 'LLM 路由（自动回复/把关用）',
  'settings.providerPlaceholder': 'provider',
  'settings.modelPlaceholder': 'model',
  'settings.llmRouteHint': 'provider / model 留空 = 所有来信一律转人工把关（不自动回复）。',
  'settings.persona': '回复角色提示（persona）',
  'settings.personaPlaceholder': '例如：后端开发',
  'settings.save': '保存节点配置',
  'settings.saving': '保存中…',
  'settings.saved': '已保存',
  'settings.saveFailed': '保存失败',
  'settings.debug': '调试模式',
  'settings.debugLabel': '开启后显示连接 JSON 串与运行数据（下方调试区）',
  'settings.debugSummary': '节点 {nodeName}（{version}）· 宣告 {advertisedHost} · 监听 {effective}（请求 {requested}）',
  'settings.debugCounts': 'peers {peers} · outbox {outbox} · inbox {inbox} · gates {gates} · pending {pending} · 连接 出{outbound}/入{inbound}',
  'settings.refreshDebug': '刷新调试数据',
  'settings.debugNoFrames': '暂无连接帧（发/收消息后这里会出现原始 JSON）。',
  'settings.projectsTitle': '协作项目',
  'settings.projectsHint': '管理本机可接收需求的项目目录。只有「广播」打开的项目名会展示给同事，绝对路径永不外泄。',
  'settings.noProjects': '暂无项目',
  'settings.projectNamePlaceholder': '项目名（如 backend-api 或 羽毛球）',
  'settings.projectPathPlaceholder': '/绝对/路径',
  'settings.broadcast': '广播',
  'settings.addProject': '＋ 添加项目',
  'settings.importWorkspaces': '从工作区导入',
  'settings.importing': '导入中…',
  'settings.imported': '已导入 {count} 个工作区',
  'settings.noneToImport': '没有新的工作区可导入',
  'settings.workspacesUnavailable': '工作区不可用',
  'settings.importFailed': '导入失败',
  'settings.loading': '加载中…',
  'settings.configUnavailable': '配置不可用',
}

export const en: P2PDict = {
  'footer.label': 'Collaborate',
  'settings.sectionLabel': 'Collaborate',
  'overlay.title': 'Collaborate',
  'overlay.titleGates': 'Collaborate · {count} to review',
  'overlay.noPeers': 'No peers online',
  'overlay.peerProjects': '（{projects}）',
  'overlay.inbox': 'Inbox',
  'overlay.inboxMessage': '{from}: {body}',
  'overlay.editReplyTitle': 'Edit reply',
  'overlay.cancel': 'Cancel',
  'overlay.send': 'Send',
  'overlay.from': 'from {name}',
  'overlay.fromProject': 'from {name} · project {project}',
  'overlay.aiDraft': 'AI draft: ',
  'overlay.aiFailed': 'AI could not draft a reply (provider missing or failed). Click "Edit" to write one before sending; an empty reply is refused.',
  'overlay.unknownSender': 'Sender is not in the node directory (not discovered / not added as a manual peer); the reply may not be delivered — add them under "Manual peers" in settings first.',
  'overlay.approve': 'Approve',
  'overlay.edit': 'Edit',
  'overlay.reject': 'Reject',
  'overlay.emptyReplyNotice': 'The reply is empty and was not sent — write something first.',
  'settings.version': 'Plugin version {version}',
  'settings.listening': 'listening on {port}',
  'settings.notRunning': 'not running',
  'settings.sep': ' · ',
  'settings.nodeName': 'Node name',
  'settings.nodeNameHint': 'Unique on the LAN; renaming rebuilds the node identity (process keeps running, but inbox/outbox are reset).',
  'settings.advertisedHost': 'Advertised host IP (optional)',
  'settings.advertisedHostPlaceholder': 'Leave empty = auto-detect the LAN address',
  'settings.advertisedHostHint': 'The address advertised to peers; only affects how others reach you. In WSL2 set your Windows host LAN IP (e.g. 10.0.0.8) together with a port-forward so colleagues can connect; leave empty for auto-detect.',
  'settings.capabilities': 'Capability tags (comma separated)',
  'settings.capabilitiesPlaceholder': 'rpc, export',
  'settings.capabilitiesHint': 'Lets colleagues find this node via capability routing.',
  'settings.autoDiscover': 'Auto-discovery (UDP multicast)',
  'settings.autoDiscoverLabel': 'Enabled (turn off where multicast is blocked and use manual peers below)',
  'settings.manualPeers': 'Manual peers (fallback when multicast is blocked)',
  'settings.manualName': 'Name',
  'settings.manualHost': 'host',
  'settings.manualPort': 'port',
  'settings.remove': 'Remove',
  'settings.addManualPeer': '＋ Add manual peer',
  'settings.port': 'Transport port',
  'settings.portHintRebind': 'Changing the port restarts the WebSocket server (process keeps running).',
  'settings.portBusy': 'Requested {requested} is busy; actually listening on {effective} (advertised to LAN peers).',
  'settings.portOk': 'Actually listening on {effective}; when the port is busy the plugin walks to the next free one (a just-released own port is waited out, so it does not drift).',
  'settings.sensitivity': 'Auto-reply review sensitivity',
  'settings.sensitivityLenient': 'Lenient (auto-reply when unsure)',
  'settings.sensitivityStandard': 'Standard (route formal/risky items to a human)',
  'settings.sensitivityStrict': 'Strict (always require human review)',
  'settings.sendWaitTimeout': 'Synchronous reply timeout (ms)',
  'settings.llmRoute': 'LLM route (auto-reply / review)',
  'settings.providerPlaceholder': 'provider',
  'settings.modelPlaceholder': 'model',
  'settings.llmRouteHint': 'Empty provider / model = route every incoming message to a human (no auto-reply).',
  'settings.persona': 'Reply persona',
  'settings.personaPlaceholder': 'e.g. backend developer',
  'settings.save': 'Save node config',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved',
  'settings.saveFailed': 'Save failed',
  'settings.debug': 'Debug mode',
  'settings.debugLabel': 'Show raw wire JSON frames and runtime data (debug section below)',
  'settings.debugSummary': 'Node {nodeName} ({version}) · advertise {advertisedHost} · listen {effective} (requested {requested})',
  'settings.debugCounts': 'peers {peers} · outbox {outbox} · inbox {inbox} · gates {gates} · pending {pending} · conns out {outbound}/in {inbound}',
  'settings.refreshDebug': 'Refresh debug data',
  'settings.debugNoFrames': 'No connection frames yet (raw JSON will appear here once messages are sent/received).',
  'settings.projectsTitle': 'Collaboration projects',
  'settings.projectsHint': 'Manage local directories that can receive requests. Only projects with "broadcast" on are shown to peers; absolute paths never leave the machine.',
  'settings.noProjects': 'No projects yet',
  'settings.projectNamePlaceholder': 'Project name (e.g. backend-api)',
  'settings.projectPathPlaceholder': '/absolute/path',
  'settings.broadcast': 'Broadcast',
  'settings.addProject': '＋ Add project',
  'settings.importWorkspaces': 'Import from workspaces',
  'settings.importing': 'Importing…',
  'settings.imported': 'Imported {count} workspace(s)',
  'settings.noneToImport': 'No new workspaces to import',
  'settings.workspacesUnavailable': 'Workspaces unavailable',
  'settings.importFailed': 'Import failed',
  'settings.loading': 'Loading…',
  'settings.configUnavailable': 'Config unavailable',
}
