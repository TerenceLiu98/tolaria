import { expect, test, type CDPSession } from '@playwright/test'
import { createFixtureVaultCopy, openFixtureVaultTauri, removeFixtureVaultCopy } from '../helpers/fixtureVault'

let tempVaultDir: string
let unexpectedBrowserMessages: string[] = []

interface AcceptanceCanvasNode {
  id: string
  type: string
  ref?: string
  title?: string
  x?: number
  y?: number
  width?: number
  height?: number
  text?: string
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
      const storageKey = 'tolaria:project-canvas-acceptance'
      const commandLogKey = 'tolaria:project-canvas-command-log'
      const stored = localStorage.getItem(storageKey)
      const canvas: AcceptanceCanvas | null = stored ? JSON.parse(stored) as AcceptanceCanvas : null
      const record = (command: string, nextCanvas?: AcceptanceCanvas | null) => {
        const previous = localStorage.getItem(commandLogKey)
        const commands = previous ? JSON.parse(previous) as Array<{ command: string; canvas?: AcceptanceCanvas | null }> : []
        commands.push({ command, canvas: nextCanvas ?? undefined })
        localStorage.setItem(commandLogKey, JSON.stringify(commands))
      }
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
        localStorage.setItem(storageKey, JSON.stringify(nextCanvas))
        record('create_project_canvas', nextCanvas)
        return result(args, nextCanvas, 'ready')
      }
      handlers.save_project_canvas = (args) => {
        const nextCanvas = commandArgs(args).canvas as AcceptanceCanvas | undefined
        localStorage.setItem(storageKey, JSON.stringify(nextCanvas))
        record('save_project_canvas', nextCanvas)
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

async function collectHeapUsed(session: CDPSession): Promise<number | null> {
  try {
    await session.send('HeapProfiler.collectGarbage')
    const result = await session.send('Performance.getMetrics')
    return result.metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value ?? null
  } catch {
    return null
  }
}

interface CanvasFrameProbe {
  done: boolean
  frames: number
  maxFrameMs: number
}

async function startCanvasFrameProbe(page: Parameters<typeof openFixtureVaultTauri>[0]): Promise<void> {
  await page.evaluate(() => {
    const probe = { frames: 0, maxFrameMs: 0, previous: performance.now(), done: false }
    const tick = (now: number) => {
      probe.maxFrameMs = Math.max(probe.maxFrameMs, now - probe.previous)
      probe.previous = now
      probe.frames += 1
      probe.done = probe.frames >= 24
      if (!probe.done) requestAnimationFrame(tick)
    }
    ;(window as typeof window & { __canvasFrameProbe?: typeof probe }).__canvasFrameProbe = probe
    requestAnimationFrame(tick)
  })
}

async function readCanvasFrameProbe(page: Parameters<typeof openFixtureVaultTauri>[0]): Promise<CanvasFrameProbe> {
  await page.waitForFunction(() => Boolean((window as typeof window & { __canvasFrameProbe?: CanvasFrameProbe }).__canvasFrameProbe?.done))
  return page.evaluate(() => {
    const probe = (window as typeof window & { __canvasFrameProbe?: CanvasFrameProbe }).__canvasFrameProbe
    return probe ?? { frames: 0, maxFrameMs: Number.POSITIVE_INFINITY, done: false }
  })
}

test.beforeEach(async ({ page }) => {
  unexpectedBrowserMessages = []
  page.on('console', message => {
    const text = message.text()
    if ((message.type() === 'error' && !text.includes('WebSocket connection to')) || /act\(\.\.\.\)|NaN|invalid value/i.test(text)) unexpectedBrowserMessages.push(`[console:${message.type()}] ${text}`)
  })
  page.on('pageerror', error => unexpectedBrowserMessages.push(`[pageerror] ${error.message}`))
  tempVaultDir = createFixtureVaultCopy()
  await installProjectCanvasHarness(page)
  await openFixtureVaultTauri(page, tempVaultDir)
})

test.afterEach(() => {
  expect(unexpectedBrowserMessages).toEqual([])
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

  const persistence = await page.evaluate(() => ({
    stored: localStorage.getItem('tolaria:project-canvas-acceptance'),
    viewportRect: document.querySelector('[data-testid="project-canvas-viewport"]')?.getBoundingClientRect().toJSON(),
    commands: JSON.parse(localStorage.getItem('tolaria:project-canvas-command-log') ?? '[]') as Array<{ command: string; canvas?: AcceptanceCanvas | null }>,
  }))
  expect(persistence.stored).not.toBeNull()
  expect(persistence.commands.some(command => command.command === 'save_project_canvas')).toBe(true)
  const lastSave = persistence.commands.filter(command => command.command === 'save_project_canvas').at(-1)?.canvas
  expect(lastSave?.nodes.map(node => node.id)).toEqual([...lastSave?.nodes.map(node => node.id) ?? []].sort())
  await page.screenshot({ path: 'test-results/project-canvas-acceptance.png', fullPage: true })
})

test('Project Canvas executes pointer gestures and clears transient overlays after cancellation @canvas', async ({ page }) => {
  await page.getByTestId('note-list-container').getByText('Alpha Project', { exact: true }).click()
  await expect(page.getByTestId('project-canvas-surface')).toBeVisible()

  const viewport = page.getByTestId('project-canvas-viewport')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.locator('.project-canvas-add-popover textarea').fill('Gesture source')
  await page.getByRole('button', { name: 'Add Card', exact: true }).click()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.locator('.project-canvas-add-popover textarea').fill('Gesture target')
  await page.getByRole('button', { name: 'Add Card', exact: true }).click()
  await page.getByRole('button', { name: 'Auto layout', exact: true }).click()

  const source = page.locator('[data-testid="project-canvas-node"]').filter({ hasText: 'Gesture source' })
  const target = page.locator('[data-testid="project-canvas-node"]').filter({ hasText: 'Gesture target' })
  const sourceId = await source.getAttribute('data-node-id')
  const targetId = await target.getAttribute('data-node-id')
  expect(sourceId).not.toBeNull()
  expect(targetId).not.toBeNull()
  await source.click()
  await expect(page.getByTestId('project-canvas-contextual-toolbar')).toBeVisible()
  await page.getByTestId('project-canvas-toolbar-action-delete').press('Escape')
  await expect(page.getByTestId('project-canvas-contextual-toolbar')).not.toBeVisible()

  const sourceBox = await source.boundingBox()
  const viewportBox = await viewport.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(viewportBox).not.toBeNull()
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 72, sourceBox!.y + sourceBox!.height / 2 + 44, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('project-canvas-snap-guide')).toHaveCount(0)

  await source.click({ modifiers: ['Shift'] })
  await target.click({ modifiers: ['Shift'] })
  await page.getByTestId('project-canvas-tool-frame').click()
  const nodeBoxes = await Promise.all([source.boundingBox(), target.boundingBox()])
  const minNodeX = Math.min(...nodeBoxes.filter((box): box is NonNullable<typeof box> => Boolean(box)).map(box => box.x))
  const minNodeY = Math.min(...nodeBoxes.filter((box): box is NonNullable<typeof box> => Boolean(box)).map(box => box.y))
  const frameStart = await page.evaluate((box) => {
    for (let y = box.y + box.height - 18; y >= box.y + 18; y -= 18) {
      for (let x = box.x + box.width - 18; x >= box.x + 70; x -= 18) {
        const element = document.elementFromPoint(x, y)
        if (element?.closest('[data-testid="project-canvas-viewport"]')
          && !element.closest('[data-node-id]')
          && !element.closest('button, textarea, input')) return { x, y }
      }
    }
    return { x: box.x + box.width - 18, y: box.y + box.height - 18 }
  }, viewportBox!)
  await page.mouse.move(frameStart.x, frameStart.y)
  await page.mouse.down()
  await page.mouse.move(Math.max(viewportBox!.x + 70, minNodeX - 16), Math.max(viewportBox!.y + 18, minNodeY - 16), { steps: 5 })
  await page.mouse.up()
  await expect(page.locator('[data-testid="project-canvas-node"][data-node-id^="group_"]')).toHaveCount(1)

  await page.getByTestId('project-canvas-tool-select').click()
  await source.click()
  const resizeHandle = page.locator('[data-testid="project-canvas-resize-handle"]').first()
  await expect(resizeHandle).toBeVisible()
  const resizeBox = await resizeHandle.boundingBox()
  expect(resizeBox).not.toBeNull()
  await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeBox!.x + 36, resizeBox!.y + 28, { steps: 3 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('project-canvas-snap-guide')).toHaveCount(0)

  await page.getByTestId('project-canvas-tool-connect').click()
  const targetBox = await target.boundingBox()
  expect(targetBox).not.toBeNull()
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2)
  await page.mouse.down()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('project-canvas-snap-guide')).toHaveCount(0)

  await page.screenshot({ path: 'test-results/project-canvas-gestures.png', fullPage: true })
})

for (const sceneNodeCount of [1000, 5000] as const) {
test(`Project Canvas keeps ${sceneNodeCount.toLocaleString()}-node low-zoom rendering within the browser budget @canvas`, async ({ page }, testInfo) => {
  testInfo.setTimeout(30_000)
  const performanceSession = await page.context().newCDPSession(page)
  await performanceSession.send('Performance.enable')
  const heapBeforeScene = await collectHeapUsed(performanceSession)
  const largeCanvas = await page.evaluate((nodeCount) => {
    const imageRef = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect width=%2248%22 height=%2248%22 fill=%22%236b7280%22/%3E%3C/svg%3E'
    const nodes = Array.from({ length: nodeCount }, (_, index) => {
      const type = index % 10 === 0 ? 'image' : index % 5 === 0 ? 'note' : index % 7 === 0 ? 'task' : 'text'
      return {
        id: `node-${String(index).padStart(4, '0')}`,
        type,
        x: (index % 100) * 80,
        y: Math.floor(index / 100) * 80,
        width: 48,
        height: 48,
        ...(type === 'image'
          ? { ref: imageRef, title: `Image ${index}` }
          : type === 'note'
            ? { ref: 'project/alpha-project.md', title: `Document ${index}` }
            : { text: `Card ${index}` }),
      }
    })
    nodes.unshift({
      id: 'project_overview',
      type: 'note',
      ref: 'project/alpha-project.md',
      x: 0,
      y: 0,
      width: 420,
      height: 280,
      text: undefined,
    })
    const canvas = {
      version: 1,
      project: 'project/alpha-project.md',
      viewport: { x: 0, y: 0, zoom: 0.4 },
      nodes,
      edges: [],
      sapientia: { schema: 'project-canvas/v1' },
    }
    localStorage.setItem('tolaria:project-canvas-acceptance', JSON.stringify(canvas))
    return canvas
  }, sceneNodeCount)

  await page.waitForTimeout(80)
  await page.getByTestId('note-list-container').getByText('Alpha Project', { exact: true }).click()
  const viewport = page.getByTestId('project-canvas-viewport')
  await expect(viewport).toBeVisible()
  await expect(viewport).toHaveAttribute('data-canvas-scene-node-count', String(largeCanvas.nodes.length))
  await expect(page.locator('[data-testid^="project-canvas-navigator-node-"]').first()).toBeVisible()

  const metrics = await page.evaluate(() => {
    const element = document.querySelector('[data-testid="project-canvas-viewport"]')
    const nodeCount = document.querySelectorAll('[data-testid="project-canvas-node"]').length
    const previews = document.querySelectorAll('[data-testid="project-document-preview"]').length
    const images = document.querySelectorAll('img.project-canvas-node__image').length
    const navigatorNodes = document.querySelectorAll('[data-testid^="project-canvas-navigator-node-"]').length
    const queryCandidates = Number(element?.getAttribute('data-canvas-query-candidates') ?? 0)
    const renderCount = Number(element?.getAttribute('data-canvas-surface-render-count') ?? 0)
    return { nodeCount, previews, images, navigatorNodes, queryCandidates, renderCount }
  })

  expect(metrics.nodeCount).toBeLessThanOrEqual(73)
  expect(metrics.previews).toBeLessThanOrEqual(40)
  expect(metrics.images).toBeGreaterThan(0)
  expect(metrics.images).toBeLessThanOrEqual(16)
  expect(metrics.navigatorNodes).toBeGreaterThan(0)
  expect(metrics.navigatorNodes).toBeLessThanOrEqual(80)
  expect(metrics.queryCandidates).toBeLessThan(500)
  expect(metrics.renderCount).toBeGreaterThan(0)
  const heapAfterScene = await collectHeapUsed(performanceSession)
  if (heapBeforeScene !== null && heapAfterScene !== null) {
    const maxSceneHeapGrowth = sceneNodeCount === 1000 ? 32 : 96
    expect(heapAfterScene - heapBeforeScene).toBeLessThan(maxSceneHeapGrowth * 1024 * 1024)
  }

  const viewportBox = await viewport.boundingBox()
  expect(viewportBox).not.toBeNull()
  const retainedNode = page.locator('[data-testid="project-canvas-node"][data-node-id="node-0011"]')
  await retainedNode.click({ force: true, position: { x: 12, y: 12 } })
  const emptyPoint = await page.evaluate((box) => {
    for (let y = box.y + box.height - 20; y >= box.y + 20; y -= 16) {
      for (let x = box.x + box.width - 20; x >= box.x + 70; x -= 16) {
        if (!document.elementFromPoint(x, y)?.closest('[data-node-id], button, input, textarea')) return { x, y }
      }
    }
    return { x: box.x + box.width - 20, y: box.y + box.height - 20 }
  }, viewportBox!)
  await startCanvasFrameProbe(page)
  await viewport.focus()
  await page.keyboard.down('Space')
  await page.mouse.move(emptyPoint.x, emptyPoint.y)
  await page.mouse.down()
  await page.mouse.move(emptyPoint.x - 600, emptyPoint.y, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const panFrameResult = await readCanvasFrameProbe(page)
  expect(panFrameResult.frames).toBe(24)
  expect(panFrameResult.maxFrameMs).toBeLessThan(50)
  await expect(retainedNode).toHaveCount(1)
  const retainedBox = await retainedNode.boundingBox()
  expect(retainedBox).not.toBeNull()
  expect(retainedBox!.x + retainedBox!.width).toBeLessThan(viewportBox!.x)
  const renderCountBeforeZoom = Number(await viewport.getAttribute('data-canvas-surface-render-count') ?? 0)
  await startCanvasFrameProbe(page)
  await page.mouse.move(viewportBox!.x + viewportBox!.width - 24, viewportBox!.y + viewportBox!.height - 24)
  await page.mouse.wheel(0, -240)
  const zoomFrameResult = await readCanvasFrameProbe(page)
  expect(zoomFrameResult.frames).toBe(24)
  expect(zoomFrameResult.maxFrameMs).toBeLessThan(50)

  const renderCountAfterZoom = Number(await viewport.getAttribute('data-canvas-surface-render-count') ?? 0)
  expect(renderCountAfterZoom - metrics.renderCount).toBeLessThanOrEqual(20)
  expect(renderCountAfterZoom - renderCountBeforeZoom).toBeLessThanOrEqual(8)
  const heapAfterZoom = await collectHeapUsed(performanceSession)
  if (heapAfterScene !== null && heapAfterZoom !== null) expect(heapAfterZoom - heapAfterScene).toBeLessThan(16 * 1024 * 1024)

  await testInfo.attach(`project-canvas-${sceneNodeCount}-metrics`, {
    body: JSON.stringify({
      ...metrics,
      panFrameResult,
      zoomFrameResult,
      heapGrowthBytes: heapBeforeScene !== null && heapAfterScene !== null ? heapAfterScene - heapBeforeScene : null,
      zoomHeapGrowthBytes: heapAfterScene !== null && heapAfterZoom !== null ? heapAfterZoom - heapAfterScene : null,
      interactionRenderCount: renderCountAfterZoom - metrics.renderCount,
      zoomRenderCount: renderCountAfterZoom - renderCountBeforeZoom,
    }, null, 2),
    contentType: 'application/json',
  })

  await page.screenshot({ path: `test-results/project-canvas-${sceneNodeCount}-budget.png`, fullPage: true })
})
}
