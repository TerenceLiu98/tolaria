export const PAPER_PARSER_PROVIDERS = ['none', 'dev-fixture', 'mineru'] as const

export type PaperParserProvider = typeof PAPER_PARSER_PROVIDERS[number]

export interface PaperParserSettings {
  mineruTokenRef: string | null
  provider: PaperParserProvider
}

export interface PaperParserSettingsSource {
  paper_parser_mineru_token_ref?: string | null
  paper_parser_provider?: string | null
}

export type PaperParserSettingsValidation =
  | { ok: true }
  | { kind: 'missing_config'; message: string; ok: false }

function normalizedProvider(value: unknown): PaperParserProvider {
  if (typeof value !== 'string') return 'none'
  const candidate = value.trim().toLowerCase()
  return PAPER_PARSER_PROVIDERS.find((provider) => provider === candidate) ?? 'none'
}

function nullableTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function normalizePaperParserSettings(settings: PaperParserSettingsSource): PaperParserSettings {
  return {
    mineruTokenRef: nullableTrimmedString(settings.paper_parser_mineru_token_ref),
    provider: normalizedProvider(settings.paper_parser_provider),
  }
}

export function validatePaperParserSettings(settings: PaperParserSettings): PaperParserSettingsValidation {
  if (settings.provider === 'mineru' && !settings.mineruTokenRef) {
    return {
      kind: 'missing_config',
      message: 'MinerU parsing requires an API token or token environment variable.',
      ok: false,
    }
  }

  return { ok: true }
}
