// Headless verification of the p2p plugin browser UI against the real dsh web:
// page load, sidebar collaboration entry, open the drawer, assert drawer/gate
// content renders, and confirm the background-task dock bar only renders with a
// count (it should be absent when idle — the conversation.input.dock is mounted).
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://127.0.0.1:3081'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`) }

const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', (e) => consoleErrors.push(String(e)))

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(6000)
  check('page loads', (await page.title()).length > 0, `title=${await page.title()}`)

  // sidebar collaboration entry
  const entry = page.locator('button', { hasText: /协作|👥/ }).first()
  const entryVisible = await entry.isVisible().catch(() => false)
  check('sidebar collaboration entry visible', entryVisible)

  // open the drawer by clicking the entry
  if (entryVisible) await entry.click()
  await page.waitForTimeout(800)

  // drawer + its header text
  const drawerText = await page.evaluate(() => document.body.innerText)
  const hasDrawer = /来自 |收件箱|批准|编辑|驳回|暂无.*对端|noPeer/i.test(drawerText)
  check('collaboration drawer opened (gate/inbox UI present)', hasDrawer,
    JSON.stringify(drawerText.split('\n').filter(t => /来自|收件箱|批准|驳回/i.test(t)).slice(0, 5)))

  // background-task dock bar: must NOT be present when nothing is pending
  const bgBar = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('div')].filter(d => /后台任务|background task/i.test((d.textContent || '')) && (d.children.length === 0 || true))
    return bars.length
  })
  check('background-task dock bar absent when idle', bgBar === 0, `found=${bgBar}`)

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
} catch (err) {
  check('open page', false, String(err))
}
await browser.close()
const failed = results.filter(r => !r.ok).length
console.log(`---\nHEADLESS-UI ${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
