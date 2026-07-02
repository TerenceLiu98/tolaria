import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { Settings } from '../types'
import type { SourceBlock } from './sourceBlocks'
import {
  normalizePaperParserSettings,
  type PaperParserProvider,
  type PaperParserSettings,
} from './parserSettings'

export interface PaperParseWarning {
  kind: string
  message: string
}

export interface PaperAsset {
  kind: string
  path: string
}

export interface PaperParseResult {
  assets: PaperAsset[]
  blocks: SourceBlock[]
  blocksPath: string
  paperId: string
  paperPath: string
  parsedAt: string
  parser: string
  parserVersion: string
  provider: PaperParserProvider
  warnings: PaperParseWarning[]
}

export interface PaperParseError {
  kind: string
  message: string
  paperId: string
  path: string
  provider: PaperParserProvider
}

function invokePaperParserCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

function isPaperParserSettings(value: Partial<Settings> | PaperParserSettings | undefined): value is PaperParserSettings {
  return typeof value === 'object' && value !== null && 'provider' in value
}

async function resolvePaperParserSettings(
  settings: Partial<Settings> | PaperParserSettings | undefined,
): Promise<PaperParserSettings> {
  if (isPaperParserSettings(settings)) return settings
  if (settings) return normalizePaperParserSettings(settings)

  const savedSettings = await invokePaperParserCommand<Settings>('get_settings', {})
  return normalizePaperParserSettings(savedSettings)
}

export async function parsePaper(
  vaultPath: string,
  paperId: string,
  settings?: Partial<Settings> | PaperParserSettings,
): Promise<PaperParseResult> {
  const parserSettings = await resolvePaperParserSettings(settings)
  return invokePaperParserCommand<PaperParseResult>('parse_paper', {
    paperId,
    settings: parserSettings,
    vaultPath,
  })
}
