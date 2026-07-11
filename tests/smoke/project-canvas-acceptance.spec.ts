import { expect, test } from '@playwright/test'
import { createFixtureVaultCopy, openFixtureVaultTauri, removeFixtureVaultCopy } from '../helpers/fixtureVault'

let tempVaultDir: string

interface AcceptanceCanvasNode {
  id: string
  type: string
  ref?: string
  title?: string
}

interface AcceptanceCanvas {
  project: string
  viewport: { x: number; y: number; zoom: number }
  nodes: AcceptanceCanvasNode[]
  edges: unknown[]
}

interface AcceptanceCommandArgs {
  projectPath?: unknown
  project_path?: unknown
  canvas?: unknown
}

async function installProjectCanvasHarness(page: Parameters<typeof openFixtureVaultTauri>[0]): Promise<void> {
  await page.addInitScript(() => {
    const install = () => {
      const handlers = (window as typeof window & { __mockHandlers?: Record<string, (args?: unknown) => unknown> }).__mockHandlers
      if (!handlers) return
      const stored = sessionStorage.getItem('project-canvas-acceptance')
      const canvas: AcceptanceCanvas | null = stored ? JSON.parse(stored) as AcceptanceCanvas : null
      const commandArgs = (args: unknown): AcceptanceCommandArgs => args && typeof args === 'object' ? args as AcceptanceCommandArgs : {}
      const projectPath = (args?: unknown) => String(commandArgs(args).projectPath ?? commandArgs(args).project_path ?? 'project/alpha-project.md')
      const result = (args: unknown, nextCanvas: AcceptanceCanvas | null, state: 'missing' | 'ready') => ({
        projectPath: projectPath(args),
        canvasPath: `${projectPath(args).replace(/\.md$/u, '')}.canvas.json`,
        state,
        canvas: nextCanvas,
      })
      handlers.read_project_canvas = (args) => result(args, canvas, canvas ? 'ready' : 'missing')
      handlers.create_project_canvas = (args) => {
        const nextCanvas = canvas ?? {
          project: projectPath(args),
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [{ id: 'project_overview', type: 'note', ref: projectPath(args), x: 0, y: 0, width: 420, height: 280, title: 'Alpha Project' }],
          edges: [],
        }
        sessionStorage.setItem('project-canvas-acceptance', JSON.stringify(nextCanvas))
        return result(args, nextCanvas, 'ready')
      }
      handlers.save_project_canvas = (args) => {
        const nextCanvas = commandArgs(args).canvas as AcceptanceCanvas | undefined
        sessionStorage.setItem('project-canvas-acceptance', JSON.stringify(nextCanvas))
        return result(args, nextCanvas, 'ready')
      }
      handlers.resolve_project_canvas_refs = (args) => ({
        projectPath: projectPath(args),
        canvasPath: `${projectPath(args).replace(/\.md$/u, '')}.canvas.json`,
        refs: ((commandArgs(args).canvas as AcceptanceCanvas | undefined)?.nodes ?? []).map(node => ({ nodeId: node.id, nodeType: node.type, ref: node.ref, state: node.ref ? 'resolved' : 'embedded', targetPath: node.ref, targetTitle: node.title })),
        diagnostics: [],
      })
    }
    install()
    window.setInterval(install, 25)
  })
}

test.beforeEach(async ({ page }) => {
  tempVaultDir = createFixtureVaultCopy()
  await installProjectCanvasHarness(page)
  await openFixtureVaultTauri(page, tempVaultDir)
})

test.afterEach(() => {
  removeFixtureVaultCopy(tempVaultDir)
})

test('Project Canvas acceptance keeps tools, Focus Mode, and persisted membership after reload @smoke @canvas', async ({ page }) => {
  const noteList = page.getByTestId('note-list-container')
  await noteList.getByText('Alpha Project', { exact: true }).click()
  await expect(page.getByTestId('project-workspace-surface')).toBeVisible()
  await expect(page.getByTestId('project-canvas-surface')).toBeVisible()

  await expect(page.getByTestId('project-canvas-tool-select')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('project-canvas-tool-hand').click()
  await expect(page.getByTestId('project-canvas-tool-hand')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('project-canvas-tool-connect').click()
  await expect(page.getByTestId('project-canvas-tool-connect')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('project-canvas-tool-frame').click()
  await expect(page.getByTestId('project-canvas-tool-frame')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('project-canvas-tool-select').click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.locator('.project-canvas-add-popover textarea').fill('Acceptance card')
  await page.getByRole('button', { name: 'Add Card', exact: true }).click()
  await expect(page.locator('[data-testid="project-canvas-node"]').filter({ hasText: 'Acceptance card' })).toBeVisible()
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click()
  await page.keyboard.press('Escape')

  const overviewCard = page.locator('[data-testid="project-canvas-node"][data-node-id="project_overview"]')
  await overviewCard.click()
  const viewport = page.getByTestId('project-canvas-viewport')
  await viewport.focus()
  await viewport.press('Enter')
  await expect(page.getByTestId('canvas-editor-portal')).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Enter focus mode' }).click()
  await expect(page.getByTestId('project-canvas-focus-mode')).toBeVisible()
  await page.getByRole('button', { name: 'Exit focus mode' }).click()
  await expect(page.getByTestId('project-canvas-focus-mode')).not.toBeVisible()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('note-list-container').getByText('Alpha Project', { exact: true }).click()
  await expect(page.getByTestId('project-canvas-surface')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Acceptance card', { exact: true })).toBeVisible()

  expect(await page.evaluate(() => Boolean(sessionStorage.getItem('project-canvas-acceptance')))).toBe(true)
  await page.screenshot({ path: 'test-results/project-canvas-acceptance.png', fullPage: true })
})
