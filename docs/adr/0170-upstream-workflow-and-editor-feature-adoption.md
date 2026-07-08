---
type: ADR
id: "0170"
title: "Adopt upstream workflow and advanced editor features as scoped Sapientia work"
status: active
date: 2026-07-08
---

# ADR 0170: Adopt Upstream Workflow and Advanced Editor Features as Scoped Sapientia Work

## Context

ADR 0169 establishes that Sapientia uses upstream Tolaria as a reference implementation, not as a merge source. The first upstream-reference batch addressed editor and Markdown stability, wikilink behavior, and bounded media/export robustness.

The upstream comparison also contains larger capabilities that are useful but cross-cutting:

- Git upstream branch sync semantics
- generated commit messages from diffs
- WSL Git provider selection
- additional CLI AI agents such as Copilot
- sandboxed HTML blocks
- vault expressions

These capabilities touch different ownership boundaries: Rust Git commands, settings and status UI, CLI agent adapters, editor schema and Markdown serialization, sandbox/CSP policy, raw editor behavior, Paper context, AI context, localization, and tests.

Bundling them into a broad "sync with upstream" change would make architecture review difficult and risks reintroducing Tolaria-specific assumptions that conflict with Sapientia's current contracts.

## Decision

Sapientia will adopt these upstream-inspired capabilities only as separate scoped implementation tracks.

Each track must be implemented against Sapientia's current architecture, naming, localization model, Paper-as-Note behavior, AI tool boundaries, and BlockNote editor seams. No track may directly merge upstream `refactoringhq/tolaria:main` into Sapientia `main`.

## Tracks

### Track A: Git Workflow Semantics

Scope:

- Define local/remote branch sync semantics for vault repositories.
- Clarify how Sapientia detects upstream branches, ahead/behind state, missing upstreams, and detached or local-only repositories.
- Preserve current support for non-git vaults and local-only git vaults.
- Keep system Git as the source of truth for auth and remote operations.

Expected implementation areas:

- Rust Git command boundary.
- Git status and commit/push UI.
- AutoGit and manual commit flows.
- Tests for local-only, upstream-configured, missing-upstream, detached, and remote-error cases.

Non-goals:

- Do not introduce provider-specific GitHub/GitLab OAuth.
- Do not require every vault to have a remote.
- Do not silently create or change upstream branches without user confirmation.

### Track B: Diff-Based Commit Message Generation

Scope:

- Generate commit message suggestions from the current git diff.
- Keep the generated message editable before commit.
- Avoid sending note content to AI unless the selected AI backend and user consent path already allow it.
- Preserve manual commit messages as the primary user-controlled action.

Expected implementation areas:

- Existing AI panel/agent infrastructure.
- Commit dialog or commit flow.
- Diff size limits and redaction.
- Product analytics for suggestion acceptance/rejection without note-content telemetry.

Non-goals:

- Do not auto-commit generated messages.
- Do not bypass the existing commit confirmation flow.
- Do not send full vault content by default.

### Track C: WSL Git Provider Selection

Scope:

- Detect Windows/WSL contexts where Git should run through a specific provider path or shell boundary.
- Make provider selection explicit, inspectable, and recoverable.
- Preserve platform-specific behavior for macOS, Linux, and native Windows.

Expected implementation areas:

- Rust platform/Git command adapters.
- Settings or diagnostics UI if provider selection is user-visible.
- Tests for native Windows, WSL, and normal Unix paths where practical.

Non-goals:

- Do not make WSL required.
- Do not add platform-specific assumptions to macOS/Linux code paths.

### Track D: Additional CLI AI Agents

Scope:

- Add upstream-inspired CLI agent adapters such as Copilot only through the shared CLI agent runtime.
- Follow ADR 0093, ADR 0103, ADR 0147, and ADR 0148 for adapter behavior, permission semantics, and cancellable streams.
- Make availability detection, onboarding copy, permissions, and failure modes explicit.

Expected implementation areas:

- CLI agent registry and adapter implementations.
- Settings/onboarding UI.
- AI panel target selection.
- Stream event handling and cancellation tests.

Non-goals:

- Do not build provider-specific bespoke AI panels.
- Do not add direct cloud API keys unless a separate ADR approves that model.
- Do not grant broader filesystem/network access than existing agent permission modes allow.

### Track E: Sandboxed HTML Blocks

Scope:

- Add a durable Markdown syntax for user-authored sandboxed HTML blocks.
- Render HTML in an isolated sandbox with a clear CSP and capability model.
- Preserve raw/source editability.
- Ensure exports, snippets, search, and AI context treat sandboxed HTML predictably.

Expected implementation areas:

- BlockNote schema extension.
- Markdown parser/serializer.
- Render sandbox and CSP policy.
- Raw editor round-trip tests.
- Security tests for script, iframe, resource, and event-handler behavior.

Non-goals:

- Do not render arbitrary unsandboxed HTML inside the main editor DOM.
- Do not let sandboxed HTML read vault files, app state, or Paper sidecars.
- Do not treat upstream HTML block behavior as automatically safe for Sapientia.

### Track F: Vault Expressions

Scope:

- Define a vault-local expression language only if Sapientia needs computed note content or embedded query results.
- Specify expression scope, permissions, determinism, caching, and failure UI before implementation.
- Decide how expressions interact with Paper notes, Paper catalog fields, wikilinks, search, exports, and AI context.

Expected implementation areas:

- Expression parser/evaluator boundary.
- Settings or feature flag if experimental.
- Markdown durability and raw editor behavior.
- Sandboxing and test fixtures.

Non-goals:

- Do not execute arbitrary JavaScript as a vault expression.
- Do not let expressions mutate vault files.
- Do not make expressions a hidden dependency for opening normal notes.

## Cross-Cutting Requirements

Every track must:

- Use Sapientia product language and manual JSON localization from ADR 0168.
- Keep Paper-as-Note contracts intact.
- Preserve BlockNote editor boundaries from ADR 0166 and ADR 0167.
- Include focused tests for the Sapientia behavior being introduced.
- Avoid direct upstream merge commits.
- Record any referenced upstream commit hashes in implementation notes or commit messages when practical.

## Implementation Order

Preferred order:

1. Git workflow semantics.
2. Diff-based commit message generation.
3. Additional CLI AI agents.
4. WSL Git provider selection when Windows/WSL work is active.
5. Sandboxed HTML blocks only after a security/design review.
6. Vault expressions only after sandboxed execution and expression scope are designed.

The first four tracks are workflow features. The last two are editor/data-model features and require deeper security and durability review.

## Consequences

### Positive

- Sapientia can absorb useful upstream workflow features without losing architecture control.
- Git, AI, and editor changes remain reviewable and testable.
- Sandboxed HTML and vault expressions get the security review they require.

### Negative

- Upstream parity takes longer than a direct merge.
- Some upstream implementation details may need to be re-derived.
- Each track needs its own tests and release-gate work.

### Neutral

- ADR 0169 remains the umbrella policy for upstream adoption.
- This ADR was initially written as a scoped adoption plan. The first implementation pass uses this ADR as the contract for the tracks below.
- Future ADRs may supersede individual tracks if product direction changes.

## Implementation Notes

Initial implementation follows the scoped-reimplementation rule from ADR 0169:

- Track A adds upstream-aware Git sync semantics without making remotes mandatory. Missing upstreams are represented explicitly and pull/push flows avoid treating local-only branches as broken repositories.
- Track B adds deterministic diff-aware commit message drafting, an AI-ready diff prompt utility, and an explicit Commit Dialog action that generates a draft from the current diff on demand. The draft remains editable and manual commit flow stays intact.
- Track C adds an environment-selectable WSL Git provider adapter at the Rust Git command boundary. Native Git remains the default on macOS, Linux, and Windows.
- Track D adds GitHub Copilot as another shared CLI agent adapter. It uses the existing CLI agent runtime, permission modes, MCP bridge, and local availability/onboarding patterns.
- Track E adds sandboxed HTML blocks as durable fenced Markdown (` ```html height="..." `), rendered through a sanitized iframe with restrictive CSP. Raw Markdown remains the edit source.
- Track F adds a deterministic vault expression template layer for HTML blocks. Expressions can read current/external note metadata and line references, but cannot mutate vault files or execute JavaScript.

Known follow-up work:

- Add user-facing settings/diagnostics for WSL provider selection if Windows users need a visible switch rather than environment variables.
- Decide whether diff-based AI commit messages need a richer consent/redaction policy before expanding beyond the current explicit on-demand Commit Dialog action.
- Expand vault expressions only after product review; cell references are represented as dependencies but should not grow into a general scripting language.
- Review HTML block export/search/AI-context representation after the core sandboxed editor behavior stabilizes.

## Test Expectations

When implemented, track-specific tests should cover:

- Git upstream detection and sync state transitions.
- Generated commit message suggestions with diff truncation/redaction.
- CLI agent availability, target selection, streaming, cancellation, and permission behavior.
- WSL/native provider selection and platform isolation.
- HTML block Markdown round-trip, sandbox restrictions, export behavior, and AI/search representation.
- Vault expression parsing, deterministic evaluation, permission denial, failure rendering, and no-mutation guarantees.
