import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import {
  DEFAULT_PORT, defaultConfig, deriveProjectName, mergeWorkspaces, normalizeProjects,
  randomNodeSuffix, resolveConfig, resolveNodeName, sanitizeHostname, slugify, validProjects,
} from '../src/config.ts'

describe('config', () => {
  it('resolves defaults', () => {
    const config = resolveConfig()
    expect(config.sensitivity).toBe('standard')
    expect(config.autoDiscover).toBe(true)
    expect(config.port).toBe(DEFAULT_PORT)
    // An empty name means "auto-generate at mount time" (hostname + random).
    expect(config.nodeName).toBe('')
    // An empty advertised host means "auto-detect the LAN address".
    expect(config.advertisedHost).toBe('')
  })

  it('merges partial config over defaults', () => {
    const config = resolveConfig({ nodeName: 'B', capabilities: ['rpc'] })
    expect(config.nodeName).toBe('B')
    expect(config.capabilities).toEqual(['rpc'])
    expect(config.port).toBe(DEFAULT_PORT)
    expect(config.advertisedHost).toBe('')
  })

  it('passes an explicit advertisedHost through', () => {
    expect(resolveConfig({ advertisedHost: '10.0.0.8' }).advertisedHost).toBe('10.0.0.8')
  })

  it('keeps defaults untouched', () => {
    expect(defaultConfig.manualPeers).toEqual([])
  })
})

describe('project table', () => {
  it('normalizes entries and keeps broadcast as given', () => {
    const projects = normalizeProjects([
      { name: 'api', path: resolve('a'), broadcast: true },
      { name: 'pay', path: resolve('b'), broadcast: false },
    ])
    expect(projects.map(p => p.name)).toEqual(['api', 'pay'])
    expect(projects[0]?.broadcast).toBe(true)
    expect(projects[1]?.broadcast).toBe(false)
  })

  it('rejects a name with whitespace', () => {
    expect(() => normalizeProjects([{ name: 'My Project', path: resolve('x'), broadcast: false }])).toThrow(/whitespace/)
  })

  it('rejects a name with a path separator', () => {
    expect(() => normalizeProjects([{ name: 'a/b', path: resolve('x'), broadcast: false }])).toThrow(/slashes/)
  })

  it('accepts CJK names', () => {
    const projects = normalizeProjects([{ name: '羽毛球', path: resolve('x'), broadcast: true }])
    expect(projects[0]?.name).toBe('羽毛球')
  })

  it('rejects duplicate names', () => {
    expect(() => normalizeProjects([
      { name: 'api', path: resolve('a'), broadcast: false },
      { name: 'api', path: resolve('b'), broadcast: false },
    ])).toThrow(/duplicate/)
  })

  it('rejects a non-absolute path', () => {
    expect(() => normalizeProjects([{ name: 'api', path: 'relative/path', broadcast: false }])).toThrow(/absolute/)
  })
})

describe('validProjects', () => {
  it('keeps actionable entries and coerces broadcast', () => {
    const projects = validProjects([
      { name: 'api', path: resolve('a'), broadcast: true },
      { name: 'pay', path: resolve('b'), broadcast: false },
    ])
    expect(projects.map(p => p.name)).toEqual(['api', 'pay'])
    expect(projects[0]?.broadcast).toBe(true)
    expect(projects[1]?.broadcast).toBe(false)
  })

  it('drops incomplete rows without throwing', () => {
    const projects = validProjects([
      { name: '', path: '', broadcast: false },
      { name: 'api', path: 'relative/path', broadcast: true },
      { name: 'bad name', path: resolve('x'), broadcast: true },
      { name: 'ok', path: resolve('y'), broadcast: true },
    ])
    expect(projects.map(p => p.name)).toEqual(['ok'])
  })

  it('keeps the first of duplicate names', () => {
    const projects = validProjects([
      { name: 'api', path: resolve('a'), broadcast: false },
      { name: 'api', path: resolve('b'), broadcast: true },
    ])
    expect(projects.map(p => p.path)).toEqual([resolve('a')])
  })

  it('tolerates undefined input', () => {
    expect(validProjects(undefined)).toEqual([])
  })
})

describe('slugify', () => {
  it('lowercases and folds non-letter/number runs to hyphens', () => {
    expect(slugify('Backend API')).toBe('backend-api')
    expect(slugify('  Pay-Service  ')).toBe('pay-service')
    expect(slugify('Foo__Bar baz')).toBe('foo-bar-baz')
  })

  it('preserves CJK titles', () => {
    expect(slugify('羽毛球')).toBe('羽毛球')
    expect(slugify('智能船1')).toBe('智能船1')
  })

  it('returns empty for values with no letter or number', () => {
    expect(slugify('')).toBe('')
    expect(slugify('---')).toBe('')
  })
})

describe('deriveProjectName', () => {
  it('prefers the title', () => {
    expect(deriveProjectName('Backend API', '/home/b/pay', 0)).toBe('backend-api')
    expect(deriveProjectName('羽毛球', '/root/羽毛球', 0)).toBe('羽毛球')
    expect(deriveProjectName('智能船1', '/root/智能船1', 0)).toBe('智能船1')
  })

  it('falls back to the path basename when the title is empty', () => {
    expect(deriveProjectName('', '/home/b/badminton', 0)).toBe('badminton')
  })

  it('falls back to project-n when both are empty', () => {
    expect(deriveProjectName('', '', 0)).toBe('project-1')
    expect(deriveProjectName('---', '/tmp/---', 2)).toBe('project-3')
  })
})

describe('mergeWorkspaces', () => {
  it('appends new workspaces with derived names and broadcast off', () => {
    const merged = mergeWorkspaces([], [
      { title: 'Backend API', path: '/home/b/api' },
      { title: '羽毛球', path: '/home/b/羽毛球' },
    ])
    expect(merged).toEqual([
      { name: 'backend-api', path: '/home/b/api', broadcast: false },
      { name: '羽毛球', path: '/home/b/羽毛球', broadcast: false },
    ])
  })

  it('skips paths already present (idempotent)', () => {
    const current = [{ name: 'api', path: '/home/b/api', broadcast: true }]
    const merged = mergeWorkspaces(current, [
      { title: 'Backend API', path: '/home/b/api' },
      { title: 'Pay', path: '/home/b/pay' },
    ])
    expect(merged).toEqual([
      { name: 'api', path: '/home/b/api', broadcast: true },
      { name: 'pay', path: '/home/b/pay', broadcast: false },
    ])
  })

  it('suffixes name collisions', () => {
    const merged = mergeWorkspaces([{ name: 'api', path: '/a', broadcast: false }], [
      { title: 'API', path: '/b' },
      { title: 'API', path: '/c' },
    ])
    expect(merged.map(p => p.name)).toEqual(['api', 'api-2', 'api-3'])
  })

  it('keeps existing entries untouched and preserves order', () => {
    const current = [{ name: 'api', path: '/a', broadcast: true }]
    const merged = mergeWorkspaces(current, [])
    expect(merged).toEqual(current)
  })
})

describe('sanitizeHostname', () => {
  it('folds a hostname into a name-safe fragment', () => {
    expect(sanitizeHostname('My-PC!')).toBe('my-pc')
    expect(sanitizeHostname('DESKTOP-ABC12')).toBe('desktop-abc12')
    expect(sanitizeHostname('---')).toBe('node')
    expect(sanitizeHostname('')).toBe('node')
  })
})

describe('randomNodeSuffix', () => {
  it('produces suffixes of the requested length from the unambiguous alphabet', () => {
    expect(randomNodeSuffix(4)).toHaveLength(4)
    expect(randomNodeSuffix(6)).toHaveLength(6)
    expect(randomNodeSuffix(4)).toMatch(/^[a-hjkmnp-z2-9]{4}$/)
  })
})

describe('resolveNodeName', () => {
  it('passes an explicit name through unchanged', () => {
    expect(resolveNodeName('node-a')).toBe('node-a')
    expect(resolveNodeName('某机器')).toBe('某机器')
  })

  it('generates a hostname-scoped random name for empty or legacy defaults', () => {
    const a = resolveNodeName('')
    const b = resolveNodeName('')
    // hostname fragment + '-abcd' suffix.
    expect(a).toMatch(/^[a-z0-9][a-z0-9-]{0,15}-[a-hjkmnp-z2-9]{4}$/)
    expect(b).toMatch(/^[a-z0-9][a-z0-9-]{0,15}-[a-hjkmnp-z2-9]{4}$/)
    expect(a).not.toBe(b)
    expect(resolveNodeName('unnamed')).toMatch(/-[a-hjkmnp-z2-9]{4}$/)
    expect(resolveNodeName('unnamed')).not.toBe('unnamed')
  })
})
