import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectEntry } from '@rellopn/dsh-p2p-lan/types'

/** Registration-side data the settings section needs. */
export interface P2PSettingsInjected {
  getProjects: () => Promise<ProjectEntry[]>
  setProjects: (projects: ProjectEntry[]) => Promise<void>
  importWorkspaces: () => Promise<{ ok: boolean; added: number }>
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

/** Settings section: manage the local project table and per-project broadcast. */
export function P2PSettingsSection({ getProjects, setProjects, importWorkspaces }: P2PSettingsProps): ReactNode {
  const [projects, setProjectsState] = useState<ProjectEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getProjects().then((list) => {
      if (!alive) return
      setProjectsState(list)
      setLoaded(true)
    }, () => {
      if (alive) setLoaded(true)
    })
    return () => { alive = false }
  }, [getProjects])

  const save = (next: ProjectEntry[]): void => {
    // Optimistic local update; the Host persists the full table (incomplete rows
    // included) and applies only the actionable subset to discovery/routing.
    setProjectsState(next)
    void setProjects(next).catch(() => {})
  }
  const patch = (index: number, next: Partial<ProjectEntry>): void => {
    save(projects.map((entry, i) => (i === index ? { ...entry, ...next } : entry)))
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

  return (
    <div style={{ padding: 16, maxWidth: 640 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>协作项目</h2>
      <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 8px' }}>
        管理本机可接收需求的项目目录。只有「广播」打开的项目名会展示给同事，绝对路径永不外泄。
      </p>
      {!loaded
        ? <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>
        : projects.length === 0
          ? <p style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>暂无项目</p>
          : null}
      {projects.map((project, index) => (
        <div key={index} style={row}>
          <input
            value={project.name}
            placeholder="项目名（如 backend-api 或 羽毛球）"
            style={{ ...input, flex: 1 }}
            onChange={(event) => { patch(index, { name: event.currentTarget.value }) }}
          />
          <input
            value={project.path}
            placeholder="/绝对/路径"
            style={{ ...input, flex: 2 }}
            onChange={(event) => { patch(index, { path: event.currentTarget.value }) }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={project.broadcast}
              onChange={() => { patch(index, { broadcast: !project.broadcast }) }}
            />
            广播
          </label>
          <button
            type="button"
            style={{ ...input, cursor: 'pointer', color: 'var(--dsw-alias-state-error-primary)' }}
            onClick={() => { save(projects.filter((_, i) => i !== index)) }}
          >
            删除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button
          type="button"
          style={{ ...input, cursor: 'pointer' }}
          onClick={() => { save([...projects, { name: '', path: '', broadcast: false }]) }}
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
