import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Config, DebugSnapshot, ManualPeer, NodeStatus, ProjectEntry } from '@rellopn/dsh-p2p-lan/types'

/** Registration-side data the settings section needs. */
export interface P2PSettingsInjected {
  getConfig: () => Promise<Config>
  setConfig: (config: Config) => Promise<void>
  getProjects: () => Promise<ProjectEntry[]>
  setProjects: (projects: ProjectEntry[]) => Promise<void>
  importWorkspaces: () => Promise<{ ok: boolean; added: number }>
  getNodeStatus: () => Promise<NodeStatus>
  getDebugSnapshot: () => Promise<DebugSnapshot>
}

/** Full component props assembled by the settings shell renderer. */
export type P2PSettingsProps = PropsRuntime<'settings.section'> & InjectFace<P2PSettingsInjected> & PropsLocale<'p2p'>

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
  const { getConfig, setConfig, getProjects, setProjects, importWorkspaces, getNodeStatus, getDebugSnapshot, t } = props
  const [config, setConfigState] = useState<Config | null>(null)
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [debugSnap, setDebugSnap] = useState<DebugSnapshot | null>(null)
  const [projects, setProjectsState] = useState<ProjectEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([getConfig(), getProjects(), getNodeStatus(), getDebugSnapshot()]).then(([cfg, list, runtime, debug]) => {
      if (!alive) return
      setConfigState(cfg)
      setProjectsState(list)
      setStatus(runtime)
      setDebugSnap(debug)
      setLoaded(true)
    }, () => {
      if (alive) setLoaded(true)
    })
    return () => { alive = false }
  }, [getConfig, getProjects, getNodeStatus, getDebugSnapshot])

  const refreshDebug = (): void => {
    getDebugSnapshot().then(setDebugSnap, () => {})
  }

  const patch = (next: Partial<Config>): void => {
    if (config === null) return
    setConfigState({ ...config, ...next })
  }
  const save = (): void => {
    if (config === null) return
    setSaved(t('settings.saving'))
    void setConfig(config).then(() => {
      setSaved(t('settings.saved'))
      // The node may have re-bound on a different port; refresh the runtime status.
      getNodeStatus().then(setStatus, () => {})
      setTimeout(() => setSaved(null), 2000)
    }, () => {
      setSaved(t('settings.saveFailed'))
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
      <h2 style={{ fontSize: 16, margin: 0 }}>{t('settings.sectionLabel')}</h2>
      <div style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 }}>
        {t('settings.version', { version: debugSnap?.version ?? '…' })}
        {debugSnap?.started === true
          ? t('settings.sep') + t('settings.listening', { port: debugSnap.effectivePort })
          : t('settings.sep') + t('settings.notRunning')}
      </div>

      <div style={label}>{t('settings.nodeName')}</div>
      <input
        value={config.nodeName}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        onChange={(event) => { patch({ nodeName: event.currentTarget.value }) }}
      />
      <div style={hint}>{t('settings.nodeNameHint')}</div>

      <div style={label}>{t('settings.advertisedHost')}</div>
      <input
        value={config.advertisedHost}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder={t('settings.advertisedHostPlaceholder')}
        onChange={(event) => { patch({ advertisedHost: event.currentTarget.value.trim() }) }}
      />
      <div style={hint}>{t('settings.advertisedHostHint')}</div>

      <div style={label}>{t('settings.capabilities')}</div>
      <input
        value={capabilitiesText}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder={t('settings.capabilitiesPlaceholder')}
        onChange={(event) => { patch({ capabilities: splitTags(event.currentTarget.value) }) }}
      />
      <div style={hint}>{t('settings.capabilitiesHint')}</div>

      <div style={label}>{t('settings.autoDiscover')}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={config.autoDiscover}
          onChange={() => { patch({ autoDiscover: !config.autoDiscover }) }}
        />
        {t('settings.autoDiscoverLabel')}
      </label>

      <div style={label}>{t('settings.manualPeers')}</div>
      {config.manualPeers.map((peer, index) => (
        <div key={index} style={row}>
          <input
            value={peer.name}
            placeholder={t('settings.manualName')}
            style={{ ...input, flex: 1 }}
            onChange={(event) => { patchManualPeer(index, { name: event.currentTarget.value }) }}
          />
          <input
            value={peer.host}
            placeholder={t('settings.manualHost')}
            style={{ ...input, flex: 2 }}
            onChange={(event) => { patchManualPeer(index, { host: event.currentTarget.value }) }}
          />
          <input
            value={peer.port}
            type="number"
            placeholder={t('settings.manualPort')}
            style={{ ...input, width: 90 }}
            onChange={(event) => { patchManualPeer(index, { port: Number(event.currentTarget.value) || 0 }) }}
          />
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { patch({ manualPeers: config.manualPeers.filter((_, i) => i !== index) }) }}
          >
            {t('settings.remove')}
          </button>
        </div>
      ))}
      <button
        type="button"
        style={{ ...input, cursor: 'pointer', marginTop: 8 }}
        onClick={() => { patch({ manualPeers: [...config.manualPeers, { name: '', host: '', port: 53420 }] }) }}
      >
        {t('settings.addManualPeer')}
      </button>

      <div style={label}>{t('settings.autoAccept')}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={config.autoAccept}
          onChange={() => { patch({ autoAccept: !config.autoAccept }) }}
        />
        {t('settings.autoAcceptLabel')}
      </label>
      <div style={hint}>{t('settings.autoAcceptHint')}</div>

      <div style={label}>{t('settings.knownPeers')}</div>
      {config.knownPeers.length === 0
        ? <div style={hint}>{t('settings.noKnownPeers')}</div>
        : null}
      {config.knownPeers.map((peer, index) => (
        <div key={index} style={row}>
          <span style={{ ...input, flex: 1 }}>{peer.name}</span>
          <span style={{ ...input, flex: 2 }}>{peer.host}:{peer.port}</span>
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { patch({ knownPeers: config.knownPeers.filter((_, i) => i !== index) }) }}
          >
            {t('settings.remove')}
          </button>
        </div>
      ))}
      <div style={hint}>{t('settings.knownPeersHint')}</div>

      <div style={label}>{t('settings.port')}</div>
      <input
        value={config.port}
        type="number"
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ port: Number(event.currentTarget.value) || 53420 }) }}
      />
      {status !== null && status.effectivePort !== config.port ? (
        <div style={{ ...hint, color: 'var(--dsw-alias-state-warning-primary, #e6a23c)' }}>
          {t('settings.portBusy', { requested: config.port, effective: status.effectivePort })}
        </div>
      ) : null}
      {status !== null && status.effectivePort === config.port ? (
        <div style={hint}>{t('settings.portOk', { effective: status.effectivePort })}</div>
      ) : null}
      <div style={hint}>{t('settings.portHintRebind')}</div>

      <div style={label}>{t('settings.sensitivity')}</div>
      <select
        value={config.sensitivity}
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ sensitivity: event.currentTarget.value as Config['sensitivity'] }) }}
      >
        <option value="lenient">{t('settings.sensitivityLenient')}</option>
        <option value="standard">{t('settings.sensitivityStandard')}</option>
        <option value="strict">{t('settings.sensitivityStrict')}</option>
      </select>

      <div style={label}>{t('settings.sendWaitTimeout')}</div>
      <input
        value={config.sendWaitTimeoutMs}
        type="number"
        style={{ ...input, marginTop: 4 }}
        onChange={(event) => { patch({ sendWaitTimeoutMs: Number(event.currentTarget.value) || 300000 }) }}
      />

      <div style={label}>{t('settings.llmRoute')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          value={config.provider}
          placeholder={t('settings.providerPlaceholder')}
          style={{ ...input, flex: 1 }}
          onChange={(event) => { patch({ provider: event.currentTarget.value }) }}
        />
        <input
          value={config.model}
          placeholder={t('settings.modelPlaceholder')}
          style={{ ...input, flex: 1 }}
          onChange={(event) => { patch({ model: event.currentTarget.value }) }}
        />
      </div>
      <div style={hint}>{t('settings.llmRouteHint')}</div>

      <div style={label}>{t('settings.persona')}</div>
      <input
        value={config.persona}
        style={{ ...input, width: '100%', marginTop: 4, boxSizing: 'border-box' }}
        placeholder={t('settings.personaPlaceholder')}
        onChange={(event) => { patch({ persona: event.currentTarget.value }) }}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
        <button type="button" style={{ ...input, cursor: 'pointer', background: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-label-primary-inverted)' }} onClick={save}>{t('settings.save')}</button>
        {saved !== null ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{saved}</span> : null}
      </div>

      <div style={label}>{t('settings.debug')}</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 4 }}>
        <input
          type="checkbox"
          checked={config.debug}
          onChange={() => { patch({ debug: !config.debug }) }}
        />
        {t('settings.debugLabel')}
      </label>

      {config.debug && debugSnap !== null ? (
        <div style={row}>
          <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}>
              {t('settings.debugSummary', {
                nodeName: debugSnap.nodeName,
                version: debugSnap.version,
                advertisedHost: debugSnap.advertisedHost || '(auto)',
                effective: debugSnap.effectivePort,
                requested: debugSnap.requestedPort,
              })}
            </div>
            <div style={{ marginBottom: 4 }}>
              {t('settings.debugCounts', {
                peers: debugSnap.peers.length,
                outbox: debugSnap.outboxCount,
                inbox: debugSnap.inboxCount,
                gates: debugSnap.gateCount,
                pending: debugSnap.pendingWaits,
                outbound: debugSnap.outboundConnections,
                inbound: debugSnap.inboundConnections,
              })}
            </div>
            <button type="button" style={{ ...input, cursor: 'pointer', marginBottom: 6 }} onClick={refreshDebug}>{t('settings.refreshDebug')}</button>
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
        </div>
      ) : null}

      <hr style={{ border: 'none', borderTop: '1px solid var(--dsw-alias-border-l1)', margin: '16px 0' }} />

      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{t('settings.projectsTitle')}</h2>
      <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' }}>
        {t('settings.projectsHint')}
      </p>
      {projects.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('settings.noProjects')}</p>
        : null}
      {projects.map((project, index) => (
        <div key={index} style={row}>
          <input
            value={project.name}
            placeholder={t('settings.projectNamePlaceholder')}
            style={{ ...input, flex: 1 }}
            onChange={(event) => { patchProject(index, { name: event.currentTarget.value }) }}
          />
          <input
            value={project.path}
            placeholder={t('settings.projectPathPlaceholder')}
            style={{ ...input, flex: 2 }}
            onChange={(event) => { patchProject(index, { path: event.currentTarget.value }) }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={project.broadcast}
              onChange={() => { patchProject(index, { broadcast: !project.broadcast }) }}
            />
            {t('settings.broadcast')}
          </label>
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { saveProjects(projects.filter((_, i) => i !== index)) }}
          >
            {t('settings.remove')}
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button
          type="button"
          style={{ ...input, cursor: 'pointer' }}
          onClick={() => { saveProjects([...projects, { name: '', path: '', broadcast: false }]) }}
        >
          {t('settings.addProject')}
        </button>
        <button
          type="button"
          style={{ ...input, cursor: 'pointer' }}
          disabled={importing}
          onClick={importFromWorkspaces}
        >
          {importing ? t('settings.importing') : t('settings.importWorkspaces')}
        </button>
        {importMessage !== null
          ? <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>{importMessage}</span>
          : null}
      </div>
    </div>
  )
}
