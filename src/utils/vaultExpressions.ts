import type { VaultEntry } from '../types'
import { splitSheetDocument } from './sheetCsv'
import { parseFrontmatter } from './frontmatter'
import { notePathsMatch } from './notePathIdentity'
import { resolveEntry, wikilinkTarget } from './wikilink'

type VaultExpressionValue = boolean | number | string | null
type VaultExpressionReferenceKind = 'cell' | 'line' | 'property'

interface TemplateExpression {
  source: string
}

type TemplatePart = string | TemplateExpression

export interface CompiledVaultExpressionTemplate {
  parts: TemplatePart[]
}

export interface VaultExpressionContext {
  contentsByPath: Map<string, string>
  currentContent: string
  entries: VaultEntry[]
  locale?: string
  sourceEntry: VaultEntry | null
}

export interface RenderedVaultExpressionTemplate {
  html: string
  unresolved: string[]
}

interface ReferenceExpression {
  kind: VaultExpressionReferenceKind
  path: string[]
  raw: string
  target: string | null
}

const TEMPLATE_EXPRESSION_PATTERN = /\{\{([\s\S]*?)\}\}/g
const CELL_ADDRESS_PATTERN = /^[A-Za-z]+[1-9]\d*$/
const ENTRY_FALLBACK_FIELD_RESOLVERS: Record<string, (entry: VaultEntry) => VaultExpressionValue> = {
  filename: (entry) => entry.filename,
  path: (entry) => entry.path,
  status: (entry) => entry.status,
  title: (entry) => entry.title,
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function splitTopLevel(source: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? ''
    if (quote) {
      current += character
      if (character === '\\') {
        current += source[index + 1] ?? ''
        index += 1
      } else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (depth === 0 && source.startsWith(separator, index)) {
      parts.push(current.trim())
      current = ''
      index += separator.length - 1
      continue
    }
    current += character
  }
  parts.push(current.trim())
  return parts
}

function unquote(source: string): string | null {
  const trimmed = source.trim()
  const quote = trimmed[0]
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return null
  let value = ''
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const character = trimmed[index] ?? ''
    if (character === '\\') {
      value += trimmed[index + 1] ?? ''
      index += 1
    } else {
      value += character
    }
  }
  return value
}

function numberLiteral(source: string): number | null {
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(source.trim())) return null
  const value = Number(source.trim())
  return Number.isFinite(value) ? value : null
}

function referenceExpression(source: string): ReferenceExpression | null {
  const trimmed = source.trim()
  const linked = trimmed.match(/^(\[\[[^\]]+\]\])\.(.+)$/u)
  if (linked) {
    const target = wikilinkTarget(linked[1] ?? '')
    const path = (linked[2] ?? '').split('.').filter(Boolean)
    return referenceFromPath({ path, raw: trimmed, target })
  }

  const current = trimmed.startsWith('this.') ? trimmed.slice(5) : trimmed
  if (!/^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*$/u.test(current)) return null
  return referenceFromPath({
    path: current.split('.'),
    raw: trimmed,
    target: null,
  })
}

function referenceFromPath({ path, raw, target }: { path: string[]; raw: string; target: string | null }): ReferenceExpression | null {
  const first = path[0]
  if (!first) return null
  const kind: VaultExpressionReferenceKind = /^\d+$/u.test(first)
    ? 'line'
    : CELL_ADDRESS_PATTERN.test(first)
      ? 'cell'
      : 'property'
  return { kind, path, raw, target }
}

function entryFallbackProperty(entry: VaultEntry | null, path: string[]): VaultExpressionValue {
  const key = path.length === 1 ? path[0] : null
  if (!entry || key === null) return null
  const fallback = ENTRY_FALLBACK_FIELD_RESOLVERS[key]
  if (fallback) return fallback(entry)
  const value = entry.properties[key]
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? value : null
}

function frontmatterProperty(content: string, path: string[]): VaultExpressionValue {
  if (path.length !== 1) return null
  const value = parseFrontmatter(content)[path[0] ?? '']
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' ? value : null
}

function referencedEntry(reference: ReferenceExpression, context: VaultExpressionContext): { content: string; entry: VaultEntry | null } | null {
  if (reference.target === null) {
    return { content: context.currentContent, entry: context.sourceEntry }
  }
  const entry = resolveEntry(context.entries, reference.target, context.sourceEntry ?? undefined)
  if (!entry) return null
  if (context.sourceEntry && notePathsMatch(entry.path, context.sourceEntry.path)) {
    return { content: context.currentContent, entry }
  }
  const content = context.contentsByPath.get(entry.path)
  return content === undefined ? null : { content, entry }
}

function resolveReference(reference: ReferenceExpression, context: VaultExpressionContext): { resolved: boolean; value: VaultExpressionValue } {
  const resolved = referencedEntry(reference, context)
  if (!resolved) return { resolved: false, value: null }
  if (reference.kind === 'line') {
    const line = splitSheetDocument(resolved.content).body.split(/\r\n|\r|\n/)[Number(reference.path[0] ?? 0) - 1]
    return line === undefined ? { resolved: false, value: null } : { resolved: true, value: line }
  }
  if (reference.kind === 'cell') return { resolved: false, value: null }
  const value = frontmatterProperty(resolved.content, reference.path)
    ?? entryFallbackProperty(resolved.entry, reference.path)
  return value === null ? { resolved: false, value: null } : { resolved: true, value }
}

function valueText(value: VaultExpressionValue): string {
  return value === null ? '' : String(value)
}

function numberValue(value: VaultExpressionValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Number(value.replace(/[$€£,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function integerArgument(value: VaultExpressionValue): number | null {
  const number = numberValue(value)
  return number === null ? null : Math.max(0, Math.trunc(number))
}

function formatCurrency(value: VaultExpressionValue, currency: VaultExpressionValue, digits: VaultExpressionValue, locale: string): string | null {
  const number = numberValue(value)
  const currencyCode = valueText(currency).trim().toUpperCase()
  if (number === null || !/^[A-Z]{3}$/u.test(currencyCode)) return null
  const fractionDigits = integerArgument(digits)
  return new Intl.NumberFormat(locale, {
    currency: currencyCode,
    maximumFractionDigits: fractionDigits ?? undefined,
    minimumFractionDigits: fractionDigits ?? undefined,
    style: 'currency',
  }).format(number)
}

function callFunction(name: string, args: VaultExpressionValue[], locale: string): { resolved: boolean; value: VaultExpressionValue } {
  const first = valueText(args[0] ?? null)
  if (name === 'default') return { resolved: true, value: first === '' ? (args[1] ?? null) : (args[0] ?? null) }
  if (name === 'upper') return { resolved: true, value: first.toUpperCase() }
  if (name === 'lower') return { resolved: true, value: first.toLowerCase() }
  if (name === 'trim') return { resolved: true, value: first.trim() }
  if (name === 'title') return { resolved: true, value: first.replace(/\b([A-Za-z])([A-Za-z]*)/g, (_match, firstLetter: string, rest: string) => `${firstLetter.toUpperCase()}${rest.toLowerCase()}`) }
  if (name === 'formatCurrency') return { resolved: true, value: formatCurrency(args[0] ?? null, args[1] ?? null, args[2] ?? null, locale) }
  return { resolved: false, value: null }
}

function evaluateExpression(source: string, context: VaultExpressionContext): { resolved: boolean; value: VaultExpressionValue } {
  const concatenation = splitTopLevel(source, '+')
  if (concatenation.length > 1) {
    const values = concatenation.map(part => evaluateExpression(part, context))
    return values.every(value => value.resolved)
      ? { resolved: true, value: values.map(value => valueText(value.value)).join('') }
      : { resolved: false, value: null }
  }

  const stringValue = unquote(source)
  if (stringValue !== null) return { resolved: true, value: stringValue }
  const number = numberLiteral(source)
  if (number !== null) return { resolved: true, value: number }

  const call = source.trim().match(/^([A-Za-z_][\w-]*)\(([\s\S]*)\)$/u)
  if (call) {
    const args = splitTopLevel(call[2] ?? '', ',').filter(part => part.length > 0)
      .map(part => evaluateExpression(part, context))
    if ((call[1] ?? '') !== 'default' && args.some(arg => !arg.resolved)) return { resolved: false, value: null }
    return callFunction(call[1] ?? '', args.map(arg => arg.value), context.locale ?? 'en-US')
  }

  const reference = referenceExpression(source)
  return reference ? resolveReference(reference, context) : { resolved: false, value: null }
}

function expressionPart(source: string): TemplateExpression {
  return { source: source.trim() }
}

export function compileVaultExpressionTemplate(source: string): CompiledVaultExpressionTemplate {
  const parts: TemplatePart[] = []
  let lastIndex = 0
  for (const match of source.matchAll(TEMPLATE_EXPRESSION_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push(source.slice(lastIndex, index))
    parts.push(expressionPart(match[1] ?? ''))
    lastIndex = index + match[0].length
  }
  if (lastIndex < source.length) parts.push(source.slice(lastIndex))
  return { parts }
}

export function renderVaultExpressionTemplate({ compiled, context }: {
  compiled: CompiledVaultExpressionTemplate
  context: VaultExpressionContext
}): RenderedVaultExpressionTemplate {
  const unresolved: string[] = []
  const html = compiled.parts.map((part) => {
    if (typeof part === 'string') return part
    const result = evaluateExpression(part.source, context)
    if (!result.resolved) {
      unresolved.push(part.source)
      return escapeHtml(`{{${part.source}}}`)
    }
    return escapeHtml(valueText(result.value))
  }).join('')
  return { html, unresolved }
}

function collectReferences(compiled: CompiledVaultExpressionTemplate): ReferenceExpression[] {
  return compiled.parts.flatMap((part) => {
    if (typeof part === 'string') return []
    return Array.from(part.source.matchAll(/\[\[[^\]]+\]\]\.(?:[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*|\d+|[A-Za-z]+[1-9]\d*)/gu))
      .map(match => referenceExpression(match[0] ?? ''))
      .filter((reference): reference is ReferenceExpression => reference !== null)
  })
}

export function vaultExpressionDependencySource(compiled: CompiledVaultExpressionTemplate): string {
  const lines = new Set<string>()
  for (const reference of collectReferences(compiled)) {
    if (reference.target === null) continue
    lines.add(`=[[${reference.target}]].${reference.path.join('.')}`)
  }
  return Array.from(lines).join('\n')
}
