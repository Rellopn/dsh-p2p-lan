import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, DebugSnapshot, LlmOption, ManualPeer, NodeStatus, ProjectEntry } from '@rellopn/dsh-p2p-lan/types'
import { field, hint, label } from './styles.ts'

/** Registration-side data the settings section needs. */
export interface P2PSettingsInjected {
  getConfig: () => Promise<Config>
  setConfig: (config: Config) => Promise<void>
  getProjects: () => Promise<ProjectEntry[]>
  setProjects: (projects: ProjectEntry[]) => Promise<void>
  importWorkspaces: () => Promise<{ ok: boolean; added: number }>
  getNodeStatus: () => Promise<NodeStatus>
  getDebugSnapshot: () => Promise<DebugSnapshot>
  getLlmOptions: () => Promise<LlmOption[]>
}

/** Full component props assembled by the settings shell renderer. */
export type P2PSettingsProps = PropsRuntime<'settings.section'> & InjectFace<P2PSettingsInjected> & PropsLocale<'p2p'>

const wrap: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 14, overflow: 'hidden',
  background: 'var(--dsw-alias-bg-layer-1)',
}
const head: React.CSSProperties = {
  padding: '13px 18px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
  display: 'flex', alignItems: 'baseline', gap: 10, background: 'var(--dsw-alias-bg-base)',
}
const body = { padding: '0 18px' }
const group: React.CSSProperties = { padding: '14px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' }
const groupTitle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--dsw-alias-label-secondary)',
  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
}
const fieldFull: React.CSSProperties = { ...field, width: '100%', boxSizing: 'border-box', marginTop: 2 }
const fieldInline: React.CSSProperties = { ...field, flex: 1, minWidth: 0 }
const fieldNum: React.CSSProperties = { ...field, width: 140 }
const btn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '6px 12px',
  font: 'inherit', cursor: 'pointer', ...extra,
})
const primaryBtn: React.CSSProperties = { ...btn(), background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)', borderColor: 'transparent' }
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--dsw-alias-state-error-primary)',
  cursor: 'pointer', font: 'inherit', textDecoration: 'underline', padding: '4px 6px',
}
const peerRow: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center',
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: 8, marginTop: 8,
  background: 'var(--dsw-alias-bg-base)',
}

/** Parse a comma-separated string into a trimmed, de-duplicated tag list. */
function splitTags(value: string): string[] {
  return [...new Set(value.split(',').map(part => part.trim()).filter(part => part !== ''))]
}

/** Settings section: full node config (identity, discovery, reply engine) + project table. */
export function P2PSettingsSection(props: P2PSettingsProps): ReactNode {
  const { getConfig, setConfig, getProjects, setProjects, importWorkspaces, getNodeStatus, getDebugSnapshot, getLlmOptions, t } = props
  const [config, setConfigState] = useState<Config | null>(null)
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [debugSnap, setDebugSnap] = useState<DebugSnapshot | null>(null)
  const [projects, setProjectsState] = useState<ProjectEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState<'saving' | 'ok' | 'fail' | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [llmOptions, setLlmOptions] = useState<LlmOption[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ discovery: false, communication: false, reply: false, projects: false, debug: false })

  useEffect(() => {
    let alive = true
    Promise.all([getConfig(), getProjects(), getNodeStatus(), getDebugSnapshot(), getLlmOptions()]).then(([cfg, list, runtime, debug, llm]) => {
      if (!alive) return
      setConfigState(cfg)
      setProjectsState(list)
      setStatus(runtime)
      setDebugSnap(debug)
      setLlmOptions(llm)
      setLoaded(true)
    }, () => {
      if (alive) setLoaded(true)
    })
    return () => { alive = false }
  }, [getConfig, getProjects, getNodeStatus, getDebugSnapshot, getLlmOptions])

  // Keep the LLM provider/model selector in sync with dsh's configured LLMs:
  // re-pull every 10s so a newly configured model shows up without reopening.
  useEffect(() => {
    let current = true
    const load = (): void => { void getLlmOptions().then(list => { if (current) setLlmOptions(list) }, () => {}) }
    load()
    const timer = setInterval(load, 10_000)
    return () => { current = false; clearInterval(timer) }
  }, [getLlmOptions])

  const toggleGroup = (name: string): void => setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))
  const refreshDebug = (): void => {
    getDebugSnapshot().then(setDebugSnap, () => {})
  }

  const patch = (next: Partial<Config>): void => {
    if (config === null) return
    setConfigState({ ...config, ...next })
  }
  const save = (): void => {
    if (config === null) return
    setSaved('saving')
    void setConfig(config).then(() => {
      setSaved('ok')
      getNodeStatus().then(setStatus, () => {})
      setTimeout(() => setSaved(null), 2000)
    }, () => {
      setSaved('fail')
    })
  }

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
        ? (result.added === 0 ? t('settings.noneToImport') : t('settings.imported', { count: result.added }))
        : t('settings.workspacesUnavailable'))
      return getProjects()
    }).then((list) => {
      setProjectsState(list)
      setLoaded(true)
    }).catch(() => {
      setImportMessage(t('settings.importFailed'))
    }).finally(() => {
      setImporting(false)
    })
  }

  if (!loaded) {
    return <div style={{ padding: 16 }}><p style={hint}>{t('settings.loading')}</p></div>
  }
  if (config === null) {
    return <div style={{ padding: 16 }}><p style={hint}>{t('settings.configUnavailable')}</p></div>
  }

  const capabilitiesText = config.capabilities.join(', ')

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <div style={wrap}>
        <div style={head}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{t('settings.sectionLabel')}</span>
          <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
            {t('settings.version', { version: debugSnap?.version ?? '…' })}
            {debugSnap?.started === true
              ? t('settings.sep') + t('settings.listening', { port: debugSnap.effectivePort })
              : t('settings.sep') + t('settings.notRunning')}
          </span>
        </div>

        <div style={body}>
          {/* ---- identity & discovery ---- */}
          <div style={group}>
            <div className="p2p-group-title" style={groupTitle} onClick={() => toggleGroup('discovery')} data-open={collapsed['discovery'] ? '0' : '1'}><span className="p2p-chev">▾</span><span>🪪</span>{t('settings.discoveryTitle')}</div>
            <div style={label}>{t('settings.nodeName')}</div>
            <input className="p2p-field" style={fieldFull} value={config.nodeName} onChange={(event) => { patch({ nodeName: event.currentTarget.value }) }} />
            <div style={hint}>{t('settings.nodeNameHint')}</div>
            <div style={label}>{t('settings.advertisedHost')}</div>
            <input className="p2p-field" style={fieldFull} value={config.advertisedHost} placeholder={t('settings.advertisedHostPlaceholder')} onChange={(event) => { patch({ advertisedHost: event.currentTarget.value.trim() }) }} />
            <div style={hint}>{t('settings.advertisedHostHint')}</div>
            <div style={label}>{t('settings.capabilities')}</div>
            <input className="p2p-field" style={fieldFull} value={capabilitiesText} placeholder={t('settings.capabilitiesPlaceholder')} onChange={(event) => { patch({ capabilities: splitTags(event.currentTarget.value) }) }} />
            <div style={hint}>{t('settings.capabilitiesHint')}</div>
            <div style={label}>{t('settings.autoDiscover')}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 }}>
              <input type="checkbox" checked={config.autoDiscover} onChange={() => { patch({ autoDiscover: !config.autoDiscover }) }} />
              {t('settings.autoDiscoverLabel')}
            </label>
            <div style={label}>{t('settings.manualPeers')}</div>
            {config.manualPeers.map((peer, index) => (
              <div key={index} style={peerRow}>
                <input className="p2p-field" style={fieldInline} value={peer.name} placeholder={t('settings.manualName')} onChange={(event) => { patchManualPeer(index, { name: event.currentTarget.value }) }} />
                <input className="p2p-field" style={fieldInline} value={peer.host} placeholder={t('settings.manualHost')} onChange={(event) => { patchManualPeer(index, { host: event.currentTarget.value }) }} />
                <input className="p2p-field" style={{ ...field, width: 90 }} value={peer.port} type="number" placeholder={t('settings.manualPort')} onChange={(event) => { patchManualPeer(index, { port: Number(event.currentTarget.value) || 0 }) }} />
                <button type="button" style={linkBtn} onClick={() => { patch({ manualPeers: config.manualPeers.filter((_, i) => i !== index) }) }}>{t('settings.remove')}</button>
              </div>
            ))}
            <button className="p2p-btn" type="button" style={{ ...btn(), marginTop: 8 }} onClick={() => { patch({ manualPeers: [...config.manualPeers, { name: '', host: '', port: 53420 }] }) }}>{t('settings.addManualPeer')}</button>
          </div>

          {/* ---- communication ---- */}
          <div style={group}>
            <div className="p2p-group-title" style={groupTitle} onClick={() => toggleGroup('communication')} data-open={collapsed['communication'] ? '0' : '1'}><span className="p2p-chev">▾</span><span>🌐</span>{t('settings.communicationTitle')}</div>
            <div style={label}>{t('settings.port')}</div>
            <input className="p2p-field" style={fieldNum} value={config.port} type="number" onChange={(event) => { patch({ port: Number(event.currentTarget.value) || 53420 }) }} />
            {status !== null && status.effectivePort !== config.port ? (
              <div style={{ ...hint, color: 'var(--dsw-alias-state-warning-primary, #e6a23c)' }}>
                {t('settings.portBusy', { requested: config.port, effective: status.effectivePort })}
              </div>
            ) : null}
            {status !== null && status.effectivePort === config.port ? (
              <div style={hint}>{t('settings.portOk', { effective: status.effectivePort })}</div>
            ) : null}
            <div style={hint}>{t('settings.portHintRebind')}</div>
            <div style={label}>{t('settings.sendWaitTimeout')}</div>
            <input className="p2p-field" style={fieldNum} value={config.sendWaitTimeoutMs} type="number" onChange={(event) => { patch({ sendWaitTimeoutMs: Number(event.currentTarget.value) || 300000 }) }} />
            <div style={label}>{t('settings.quickWait')}</div>
            <input className="p2p-field" style={fieldNum} value={config.quickWaitMs} type="number" onChange={(event) => { patch({ quickWaitMs: Number(event.currentTarget.value) || 10000 }) }} />
          </div>

          {/* ---- reply engine ---- */}
          <div style={group}>
            <div className="p2p-group-title" style={groupTitle} onClick={() => toggleGroup('reply')} data-open={collapsed['reply'] ? '0' : '1'}><span className="p2p-chev">▾</span><span>🤖</span>{t('settings.replyTitle')}</div>
            <div style={label}>{t('settings.sensitivity')}</div>
            <select className="p2p-field" style={{ ...field, width: 220 }} value={config.sensitivity} onChange={(event) => { patch({ sensitivity: event.currentTarget.value as Config['sensitivity'] }) }}>
              <option value="lenient">{t('settings.sensitivityLenient')}</option>
              <option value="standard">{t('settings.sensitivityStandard')}</option>
              <option value="strict">{t('settings.sensitivityStrict')}</option>
            </select>
            <div style={label}>{t('settings.llmProvider')}</div>
            <select className="p2p-field" style={{ ...field, width: '100%' }} value={config.provider} onChange={(event) => { patch({ provider: event.currentTarget.value, model: '' }) }}>
              {llmOptions.length === 0
                ? <option value="">{t('settings.llmNoProviders')}</option>
                : llmOptions.map(option => <option key={option.provider} value={option.provider}>{option.providerName}</option>)}
            </select>
            <div style={label}>{t('settings.llmModel')}</div>
            <select className="p2p-field" style={{ ...field, width: '100%' }} value={config.model} onChange={(event) => { patch({ model: event.currentTarget.value }) }}>
              {(() => {
                const current = llmOptions.find(option => option.provider === config.provider)
                const models = current?.models ?? []
                if (models.length === 0) return <option value="">{t('settings.llmNoModels')}</option>
                return models.map(model => <option key={model} value={model}>{model}</option>)
              })()}
            </select>
            <div style={hint}>{t('settings.llmRouteHint')}</div>
            <div style={label}>{t('settings.persona')}</div>
            <input className="p2p-field" style={fieldFull} value={config.persona} placeholder={t('settings.personaPlaceholder')} onChange={(event) => { patch({ persona: event.currentTarget.value }) }} />
          </div>

          {/* ---- projects ---- */}
          <div style={group}>
            <div className="p2p-group-title" style={groupTitle} onClick={() => toggleGroup('projects')} data-open={collapsed['projects'] ? '0' : '1'}><span className="p2p-chev">▾</span><span>📁</span>{t('settings.projectsTitle')}</div>
            <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' }}>{t('settings.projectsHint')}</p>
            {projects.length === 0 ? <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('settings.noProjects')}</p> : null}
            {projects.map((project, index) => (
              <div key={index} style={peerRow}>
                <input className="p2p-field" style={fieldInline} value={project.name} placeholder={t('settings.projectNamePlaceholder')} onChange={(event) => { patchProject(index, { name: event.currentTarget.value }) }} />
                <input className="p2p-field" style={{ ...field, flex: 2, minWidth: 0 }} value={project.path} placeholder={t('settings.projectPathPlaceholder')} onChange={(event) => { patchProject(index, { path: event.currentTarget.value }) }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={project.broadcast} onChange={() => { patchProject(index, { broadcast: !project.broadcast }) }} />
                  {t('settings.broadcast')}
                </label>
                <button type="button" style={linkBtn} onClick={() => { saveProjects(projects.filter((_, i) => i !== index)) }}>{t('settings.remove')}</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <button className="p2p-btn" type="button" style={btn()} onClick={() => { saveProjects([...projects, { name: '', path: '', broadcast: false }]) }}>{t('settings.addProject')}</button>
              <button className="p2p-btn" type="button" style={btn()} disabled={importing} onClick={importFromWorkspaces}>{importing ? t('settings.importing') : t('settings.importWorkspaces')}</button>
              {importMessage !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{importMessage}</span> : null}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <button className="p2p-btn p2p-btn-primary" type="button" style={primaryBtn} onClick={save}>{t('settings.save')}</button>
              {saved === 'ok' ? <span className="p2p-pop" style={{ fontSize: 12, color: 'var(--dsw-alias-state-success-primary)', background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)', padding: '3px 10px', borderRadius: 20 }}>✓ {t('settings.saved')}</span> : null}
              {saved === 'saving' ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{t('settings.saving')}</span> : null}
              {saved === 'fail' ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' }}>{t('settings.saveFailed')}</span> : null}
            </div>
          </div>

          {/* ---- debug ---- */}
          <div style={group}>
            <div className="p2p-group-title" style={groupTitle} onClick={() => toggleGroup('debug')} data-open={collapsed['debug'] ? '0' : '1'}><span className="p2p-chev">▾</span><span>🐞</span>{t('settings.debug')}</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginTop: 4 }}>
              <input type="checkbox" checked={config.debug} onChange={() => { patch({ debug: !config.debug }) }} />
              {t('settings.debugLabel')}
            </label>
            {config.debug && debugSnap !== null ? (
              <div style={{ marginTop: 8, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, padding: 10, background: 'var(--dsw-alias-bg-base)' }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  {t('settings.debugSummary', {
                    nodeName: debugSnap.nodeName, version: debugSnap.version,
                    advertisedHost: debugSnap.advertisedHost || '(auto)',
                    effective: debugSnap.effectivePort, requested: debugSnap.requestedPort,
                  })}
                </div>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  {t('settings.debugCounts', {
                    peers: debugSnap.peers.length, outbox: debugSnap.outboxCount, inbox: debugSnap.inboxCount,
                    gates: debugSnap.gateCount, pending: debugSnap.pendingWaits,
                    outbound: debugSnap.outboundConnections, inbound: debugSnap.inboundConnections,
                  })}
                </div>
                <button className="p2p-btn" type="button" style={{ ...btn(), marginBottom: 6 }} onClick={refreshDebug}>{t('settings.refreshDebug')}</button>
                {debugSnap.peers.length > 0 ? (
                  <pre style={{ margin: '4px 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--dsw-alias-label-secondary)' }}>
{debugSnap.peers.map(p => `${p.name} (${p.host}:${p.port}) [${p.capabilities.join(',') || 'no caps'}]`).join('\n')}
                  </pre>
                ) : null}
                {debugSnap.frames.length === 0 ? (
                  <div style={hint}>{t('settings.debugNoFrames')}</div>
                ) : (
                  <pre style={{ margin: '4px 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 260, overflow: 'auto', color: 'var(--dsw-alias-label-secondary)' }}>
{debugSnap.frames.slice(0, 20).map(f => `${f.dir === 'in' ? '◀' : '▶'} ${new Date(f.ts).toISOString().slice(11, 23)} ${f.json}`).join('\n')}
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
