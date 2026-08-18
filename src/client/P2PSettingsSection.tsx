import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, ManualPeer, NodeStatus, ProjectEntry } from '@rellopn/dsh-p2p-lan/types'

/** Registration-side data the settings section needs. */
export interface P2PSettingsInjected {
  getConfig: () => Promise<Config>
  setConfig: (config: Config) => Promise<void>
  getProjects: () => Promise<ProjectEntry[]>
  setProjects: (projects: ProjectEntry[]) => Promise<void>
  importWorkspaces: () => Promise<{ ok: boolean; added: number }>
  getNodeStatus: () => Promise<NodeStatus>
}

/** Full component props assembled by the settings shell renderer. */
export type P2PSettingsProps = PropsRuntime<'settings.section'> & InjectFace<P2PSettingsInjected>

const row: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: 8, marginTop: 8,
}
const input: React.CSSProperties = {
  background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px', font: 'inherit',
}
const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 10 }
const hint: React.CSSProperties = { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 }

/** Parse a comma-separated string into a trimmed, de-duplicated tag list. */
function splitTags(value: string): string[] {
  return [...new Set(value.split(',').map(part => part.trim()).filter(part => part !== ''))]
}

/** Settings section: full node config (identity, discovery, reply engine) + project table. */
export function P2PSettingsSection(props: P2PSettingsProps): ReactNode {
  const { getConfig, setConfig, getProjects, setProjects, importWorkspaces, getNodeStatus } = props
  const [config, setConfigState] = useState<Config | null>(null)
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [projects, setProjectsState] = useState<ProjectEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([getConfig(), getProjects(), getNodeStatus()]).then(([cfg, list, runtime]) => {
      if (!alive) return
      setConfigState(cfg)
      setProjectsState(list)
      setStatus(runtime)
      setLoaded(true)
    }, () => {
      if (alive) setLoaded(true)
    })
    return () => { alive = false }
  }, [getConfig, getProjects, getNodeStatus])

  const patch = (next: Partial<Config>): void => {
    if (config === null) return
    setConfigState({ ...config, ...next })
  }
  const save = (): void => {
    if (config === null) return
    setSaved('保存中…')
    void setConfig(config).then(() => {
      setSaved('已保存')
      // The node may have re-bound on a different port; refresh the runtime status.
      getNodeStatus().then(setStatus, () => {})
      setTimeout(() => setSaved(null), 2000)
    }, () => {
      setSaved('保存失败')
    })
  }

  // --- project table (kept separate: getProjects/setProjects + import) ---
  const saveProjects = (next: ProjectEntry[]): void => {
    setProjectsState(next)
    void setProjects(next).catch(() => {})
  }
  const patchProject = (index: number, next: Partial<ProjectEntry>): void => {
    saveProjects(projects.map((entry, i) => (i === index ? { ...entry, ...next } : entry)))
  }
  const patchManualPeer = (index: number, next: Partial<ManualPeer>): void => {
    if (config === null) return
    const peers = config.manualPeers.map((peer, i) => (i === index ? { ...peer, ...next } : peer))
    patch({ manualPeers: peers })
  }

  const importFromWorkspaces = (): void => {
    setImporting(true)
    setImportMessage(null)
    importWorkspaces().then((result) => {
      setImportMessage(result.ok
        ? (result.added === 0 ? '没有新的工作区可导入' : `已导入 ${result.added} 个工作区`)
        : '工作区不可用')
      return getProjects()
    }).then((list) => {
      setProjectsState(list)
      setLoaded(true)
    }).catch(() => {
      setImportMessage('导入失败')
    }).finally(() => {
      setImporting(false)
    })
  }

  if (!loaded) {
    return <div style={{ padding: 16 }}><p style={hint}>加载中…</p></div>
  }
  if (config === null) {
    return <div style={{ padding: 16 }}><p style={hint}>配置不可用</p></div>
  }

  const capabilitiesText = config.capabilities.join(', ')

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>协作</h2>

      <div style={label}>节点名称</div>
      <input
        value={config.nodeName}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        onChange={(event) => { patch({ nodeName: event.currentTarget.value }) }}
      />
      <div style={hint}>全网唯一；改名会重建节点身份（进程不重启，但收件箱/发件箱会重置）。</div>

      <div style={label}>对外宣告 IP（可选）</div>
      <input
        value={config.advertisedHost}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder="留空 = 自动检测局域网地址"
        onChange={(event) => { patch({ advertisedHost: event.currentTarget.value.trim() }) }}
      />
      <div style={hint}>广播给同事的连接地址，只影响别人连你。WSL2 里跑 dsh 时填 Windows 主机的局域网 IP（如 10.0.0.8），配合端口转发让同事能连进来；留空则自动检测。</div>

      <div style={label}>能力标签（逗号分隔）</div>
      <input
        value={capabilitiesText}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder="rpc, export"
        onChange={(event) => { patch({ capabilities: splitTags(event.currentTarget.value) }) }}
      />
      <div style={hint}>供同事用「按能力路由」找到本机。</div>

      <div style={label}>自动发现（UDP 组播）</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={config.autoDiscover}
          onChange={() => { patch({ autoDiscover: !config.autoDiscover }) }}
        />
        开启（组播被禁的环境请关闭并用下面的手动节点）
      </label>

      <div style={label}>手动节点（组播被禁时的 fallback）</div>
      {config.manualPeers.map((peer, index) => (
        <div key={index} style={row}>
          <input
            value={peer.name}
            placeholder="名称"
            style={{ ...input, flex: 1 }}
            onChange={(event) => { patchManualPeer(index, { name: event.currentTarget.value }) }}
          />
          <input
            value={peer.host}
            placeholder="host"
            style={{ ...input, flex: 2 }}
            onChange={(event) => { patchManualPeer(index, { host: event.currentTarget.value }) }}
          />
          <input
            value={peer.port}
            type="number"
            placeholder="port"
            style={{ ...input, width: 90 }}
            onChange={(event) => { patchManualPeer(index, { port: Number(event.currentTarget.value) || 0 }) }}
          />
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { patch({ manualPeers: config.manualPeers.filter((_, i) => i !== index) }) }}
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        style={{ ...input, cursor: 'pointer', marginTop: 8 }}
        onClick={() => { patch({ manualPeers: [...config.manualPeers, { name: '', host: '', port: 53420 }] }) }}
      >
        ＋ 添加手动节点
      </button>

      <div style={label}>传输端口</div>
      <input
        value={config.port}
        type="number"
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ port: Number(event.currentTarget.value) || 53420 }) }}
      />
      {status !== null && status.effectivePort !== config.port ? (
        <div style={{ ...hint, color: 'var(--dsw-alias-state-warning-primary, #e6a23c)' }}>
          请求的 {config.port} 被占用，当前实际监听 <strong>{status.effectivePort}</strong>（将广播给局域网同事）。
        </div>
      ) : null}
      {status !== null && status.effectivePort === config.port ? (
        <div style={hint}>当前实际监听 {status.effectivePort}；端口被占用时插件会自动顺延到下一个空闲端口（自己刚释放的端口会被等待回收，不会漂移）。</div>
      ) : null}
      <div style={hint}>改端口会重启 WebSocket server（进程不重启）。</div>

      <div style={label}>自动回复把关灵敏度</div>
      <select
        value={config.sensitivity}
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ sensitivity: event.currentTarget.value as Config['sensitivity'] }) }}
      >
        <option value="lenient">宽松（拿不准就自动回复）</option>
        <option value="standard">标准（正式/有风险才转人工）</option>
        <option value="strict">严格（一律转人工把关）</option>
      </select>

      <div style={label}>同步等待回复超时（毫秒）</div>
      <input
        value={config.sendWaitTimeoutMs}
        type="number"
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ sendWaitTimeoutMs: Number(event.currentTarget.value) || 300000 }) }}
      />

      <div style={label}>LLM 路由（自动回复/把关用）</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          value={config.provider}
          placeholder="provider"
          style={{ ...input, flex: 1 }}
          onChange={(event) => { patch({ provider: event.currentTarget.value }) }}
        />
        <input
          value={config.model}
          placeholder="model"
          style={{ ...input, flex: 1 }}
          onChange={(event) => { patch({ model: event.currentTarget.value }) }}
        />
      </div>
      <div style={hint}>provider / model 留空 = 所有来信一律转人工把关（不自动回复）。</div>

      <div style={label}>回复角色提示（persona）</div>
      <input
        value={config.persona}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder="例如：后端开发"
        onChange={(event) => { patch({ persona: event.currentTarget.value }) }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
        <button type="button" style={{ ...input, cursor: 'pointer', background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)' }} onClick={save}>保存节点配置</button>
        {saved !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{saved}</span> : null}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--dsw-alias-border-l1)', margin: '16px 0' }} />

      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>协作项目</h2>
      <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' }}>
        管理本机可接收需求的项目目录。只有「广播」打开的项目名会展示给同事，绝对路径永不外泄。
      </p>
      {projects.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>暂无项目</p>
        : null}
      {projects.map((project, index) => (
        <div key={index} style={row}>
          <input
            value={project.name}
            placeholder="项目名（如 backend-api 或 羽毛球）"
            style={{ ...input, flex: 1 }}
            onChange={(event) => { patchProject(index, { name: event.currentTarget.value }) }}
          />
          <input
            value={project.path}
            placeholder="/绝对/路径"
            style={{ ...input, flex: 2 }}
            onChange={(event) => { patchProject(index, { path: event.currentTarget.value }) }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={project.broadcast}
              onChange={() => { patchProject(index, { broadcast: !project.broadcast }) }}
            />
            广播
          </label>
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { saveProjects(projects.filter((_, i) => i !== index)) }}
          >
            删除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button
          type="button"
          style={{ ...input, cursor: 'pointer' }}
          onClick={() => { saveProjects([...projects, { name: '', path: '', broadcast: false }]) }}
        >
          ＋ 添加项目
        </button>
        <button
          type="button"
          style={{ ...input, cursor: 'pointer' }}
          disabled={importing}
          onClick={importFromWorkspaces}
        >
          {importing ? '导入中…' : '从工作区导入'}
        </button>
        {importMessage !== null
          ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{importMessage}</span>
          : null}
      </div>
    </div>
  )
}
