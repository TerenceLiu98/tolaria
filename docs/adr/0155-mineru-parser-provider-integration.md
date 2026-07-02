# ADR-0155: MinerU Parser Provider Integration

## Status

Active

## Context

Paper bundles use local files as the durable source of truth. Phase 4A introduced a parser-provider boundary so `parse_paper` can produce `papers/<paper-slug>/blocks.jsonl` without coupling the Paper Reader to a parser implementation.

Phase 4B needs a real MinerU provider while preserving Tolaria's files-first model:

- `source.pdf` must remain immutable.
- Provider credentials must not be written into the vault.
- Failed parses must not destroy a previous valid `blocks.jsonl`.
- Provider output must normalize into the canonical SourceBlock contract.

MinerU returns structured parse artifacts through remote API responses, including content-list JSON inside downloaded output ZIPs. Tolaria already depends on `reqwest`; Phase 4B adds direct use of `zip`, `sha2`, and `hex` for result extraction and stable SourceBlock hashes.

## Decision

Implement MinerU behind the existing `PaperParserProvider::Mineru` boundary in `src-tauri/src/paper/parse.rs`.

The provider flow is:

1. Resolve the configured MinerU token value from installation-local settings.
2. Use the configured value directly when it is an API token, or resolve it from the app process environment when it is an environment variable name.
3. Request a MinerU batch upload URL.
4. PUT the local `source.pdf` bytes to that upload URL.
5. Poll the MinerU batch result endpoint until done or failed.
6. Download `content_list.json` directly when provided, otherwise download the result ZIP and extract the content-list JSON.
7. Normalize provider output into canonical `SourceBlock[]`.
8. Write `blocks.jsonl` only after normalization succeeds.
9. Update `paper.md` parse metadata.

The parser writes `parse_status: parsing` when a parse starts, `parse_status: parsed` after successful sidecar write, and `parse_status: failed` with `parse_error` when provider, output, or local write failures occur.

## Consequences

- MinerU credentials stay outside the vault. `paper.md` records provider and parser metadata, but never the token.
- A failed MinerU parse preserves the previous `blocks.jsonl` file when one exists.
- Successful reparses may replace `blocks.jsonl`; the parse result includes a warning when an existing sidecar was replaced.
- SourceBlock hashes are deterministic SHA-256 values derived from normalized block identity/content.
- The Reader can offer a provider-aware "Parse with MinerU" action while continuing to support the dev fixture provider.

## Non-Goals

- No AI Ask, memory compiler, graph visualization, or PDF coordinate overlay work.
- No MinerU-specific vault schema.
- No requirement that all users configure MinerU; local/dev fixture parsing remains valid.
