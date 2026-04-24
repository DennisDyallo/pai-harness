# pai-harness

Isolated testing and validation harness for PAI (Personal AI) hooks — the TypeScript hook system that extends Claude Code.

## Commands

```bash
bun test                    # Run all 143 tests
bun test --filter "paths"   # Run tests matching pattern
bun run lint                # Biome lint check
bun run lint:fix            # Biome auto-fix
bun run typecheck           # tsc --noEmit
bun run check               # lint + typecheck combined
bun bin/pai-harness.ts      # CLI entry point (see --help)
```

## Architecture

- **Runtime:** Bun (TypeScript)
- **Linter:** Biome 2.x (noUnusedImports, noUnusedVariables, useConst)
- **Type checking:** tsc with noUnusedLocals + noUnusedParameters
- **Test framework:** bun:test

### Core (`src/core/`)
- `paths.ts` — Centralized path resolution for PAI directories (respects `CLAUDE_CONFIG_DIR`, `PAI_DIR`, falls back to `~/.claude`)
- `sandbox.ts` — Temp directory factory mimicking `~/.claude/` structure with dynamic directory discovery and production seeding
- `runner.ts` — Subprocess hook executor via `Bun.spawn()`, matching Claude Code's execution model
- `fixtures.ts` — Factory functions for hook input payloads (SessionStart, UserPromptSubmit, PreToolUse, etc.)
- `types.ts` — Shared type definitions

### Analyzers (`src/analyzers/`)
- `dependency-graph.ts` — Static analysis of hook file read/write dependencies
- `context-assembly.ts` — Simulates SessionStart context injection
- `context-tokens.ts` — Token estimation (~3.5 chars/token)
- `output-validator.ts` — Hook output schema validation

### Live debugging (`src/live/`)
- `interceptor.ts` — JSONL hook I/O logging via `PAI_HARNESS_LOG` env var
- `log-parser.ts` — Parse Claude Code session JSONL logs
- `replay.ts` — Re-execute captured hook invocations in sandbox

### Mock API (`src/mock-api/`)
- `server.ts` — Bun.serve mock for `ANTHROPIC_BASE_URL` redirection
- `proxy.ts` — HTTPS_PROXY setup helper
- `scenarios/` — Predefined API response scenarios

### Sync (`src/sync/`)
- `drift-detector.ts` — Diff source config vs live `~/.claude/` hooks with symlink resolution and recursive scanning
- `settings-validator.ts` — Schema-learning validator that adapts to production settings.json structure

## Claude Code `--bare` Mode

The `--bare` CLI flag starts Claude Code in minimal mode, useful for deterministic and faster hook testing.

### What `--bare` skips
- Hooks, LSP, plugin sync, attribution, auto-memory, background prefetches
- Keychain/OAuth reads (auth via `ANTHROPIC_API_KEY` or `apiKeyHelper` only)
- CLAUDE.md auto-discovery, skills auto-loading, MCP server auto-discovery

### What `--bare` keeps
- Bash, Read, Edit tools
- Explicit context via flags: `--append-system-prompt[-file]`, `--settings <file-or-json>`, `--mcp-config`, `--agents`, `--plugin-dir`
- Skills still resolve via `/skill-name`

### Environment variable
- Sets `CLAUDE_CODE_SIMPLE=1` — can also be set directly without the flag for equivalent behavior

### Relevance to harness testing
- **Deterministic execution:** Prevents env leakage from user's `~/.claude/` hooks/plugins/MCP into test runs
- **Faster startup:** Reduced init time = faster test cycles in `runner.ts` subprocess tests
- **Complements sandbox isolation:** Works alongside `CLAUDE_CONFIG_DIR` + `PAI_DIR` env var isolation
- **Integration testing:** Use `claude --bare -p "prompt" --settings <test-settings.json>` to test hooks with explicit-only context
- **CI/CD:** Recommended mode for scripted/SDK calls; will become default for `-p` in a future release

### Example usage in tests
```bash
# Run a hook test with explicit settings only, no env leakage
claude --bare -p "test prompt" --settings ./test-settings.json --allowedTools "Bash,Read,Edit"

# Set via env var instead of flag
CLAUDE_CODE_SIMPLE=1 claude -p "test prompt"
```

## Phase 2: Self-Syncing Infrastructure (Completed)

The harness now dynamically syncs with production PAI instead of hardcoding assumptions:

### Centralized Path Resolution
All modules use `src/core/paths.ts` for PAI directory resolution:
- `resolvePaiDir()` — Checks `CLAUDE_CONFIG_DIR`, `PAI_DIR`, falls back to `~/.claude`
- `resolveHooksDir()`, `resolveSettingsPath()`, `resolveProjectsDir()` — Derived paths
- Enables sandbox isolation via env vars while maintaining production compatibility

### Dynamic Sandbox Mirroring
`sandbox.ts` now supports:
- `useDynamicDirs: true` — Discovers production directory structure instead of static list
- `seedFromProduction: true` — Copies minimal stubs (settings.json, skill files, learning-index.json)
- API keys sanitized during seeding (replaced with `TEST_VALUE_REDACTED`)
- Falls back to static `MEMORY_DIRS` if production can't be read

### Self-Resolving Drift Detection
`drift-detector.ts` improvements:
- Follows symlinks in `~/.claude/hooks/` to discover source directory
- Recursively scans `lib/` and `handlers/` subdirectories
- Falls back to known locations if no symlinks found

### Schema-Learning Settings Validator
`settings-validator.ts` now:
- Learns schema from production `settings.json` instead of static expectations
- Only enforces minimal required sections (`hooks`, `permissions`)
- Reports unexpected patterns as warnings instead of errors
- Returns `learnedSchema` with discovered top-level keys and hook events

## Conventions

- All Node.js imports use `node:` protocol (`import { join } from "node:path"`)
- Tests use sandbox isolation — never touch real `~/.claude/`
- External deps mocked: `PAI_INFERENCE_MOCK` (inference), stubs for `kitten`/`curl`
- Hook tests execute as subprocesses via `runner.ts`, matching Claude Code behavior
- All PAI path construction uses `src/core/paths.ts` for dynamic resolution
