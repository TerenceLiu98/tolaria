import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { findMarkdownFiles, getNote } from './vault.js'
import {
  headingTitle,
  normalizeCanvas,
  normalizedRef,
  noteType,
  slashPath,
  stringValue,
  validateCanvas,
} from './project-canvas-model.js'

export async function listProjectCanvases(vaultPath) {
  const files = await findMarkdownFiles(vaultPath)
  const projects = []
  for (const filePath of files) {
    const projectPath = slashPath(path.relative(vaultPath, filePath))
    const note = await getNote(vaultPath, projectPath)
    if (noteType(note.frontmatter) !== 'Project') continue
    projects.push(await projectEntry(vaultPath, note))
  }
  return projects.sort((left, right) => left.projectPath.localeCompare(right.projectPath))
}

export async function findProject(vaultPath, identifier) {
  const projects = await listProjectCanvases(vaultPath)
  const matches = projects.filter(project => (
    project.projectId === identifier
    || project.projectPath === normalizedRef(identifier)
    || project.title === identifier
  ))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`Project identifier is ambiguous in vault ${vaultPath}: ${identifier}`)
  await assertMissingIdentifierIsSafe(vaultPath, identifier)
  throw new Error(`Project not found or note is not type: Project: ${identifier}`)
}

export async function readCanvasFile(vaultPath, project) {
  const raw = await readFile(path.join(vaultPath, project.canvasPath), 'utf-8')
  const canvas = JSON.parse(raw)
  validateCanvas(canvas)
  return normalizeCanvas(canvas, project.projectPath)
}

export async function writeCanvasFile(vaultPath, project, canvas) {
  const absolutePath = path.join(vaultPath, project.canvasPath)
  await assertWritablePath(vaultPath, absolutePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  const normalized = normalizeCanvas(canvas, project.projectPath)
  await writeFile(absolutePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
}

async function projectEntry(vaultPath, note) {
  const canvasPath = canvasPathForProject(note.path)
  const state = await fileExists(path.join(vaultPath, canvasPath)) ? 'ready' : 'missing'
  return {
    projectId: stringValue(note.frontmatter.project_id) ?? note.path,
    projectPath: slashPath(note.path),
    canvasPath,
    title: stringValue(note.frontmatter.title) ?? headingTitle(note.content) ?? path.basename(note.path, '.md'),
    state,
    vaultPath,
    vaultLabel: path.basename(vaultPath) || vaultPath,
  }
}

async function assertMissingIdentifierIsSafe(vaultPath, identifier) {
  if (!identifier.endsWith('.md')) return
  try {
    const note = await getNote(vaultPath, identifier)
    if (noteType(note.frontmatter) !== 'Project') throw new Error('Project Canvas requires a type: Project note')
  } catch (error) {
    if (String(error.message).includes('inside the active vault')) throw error
    if (String(error.message).includes('type: Project')) throw error
  }
}

async function assertWritablePath(vaultPath, targetPath) {
  const vaultRoot = await realpath(vaultPath)
  const relative = path.relative(path.resolve(vaultPath), path.resolve(targetPath))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw outsideVaultError()
  const existingTarget = await realpath(targetPath).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error))
  if (existingTarget) assertInside(vaultRoot, existingTarget)
  assertInside(vaultRoot, await realpath(path.dirname(targetPath)))
}

function assertInside(vaultRoot, targetPath) {
  const relative = path.relative(vaultRoot, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw outsideVaultError()
}

function outsideVaultError() {
  return new Error('Project Canvas path must stay inside the active vault')
}

function canvasPathForProject(projectPath) {
  const parsed = path.posix.parse(slashPath(projectPath))
  return parsed.base === 'project.md'
    ? path.posix.join(parsed.dir, 'project.canvas.json')
    : path.posix.join(parsed.dir, `${parsed.name}.canvas.json`)
}

async function fileExists(filePath) {
  return access(filePath).then(() => true, () => false)
}
