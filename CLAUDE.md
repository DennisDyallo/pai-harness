# pai-harness

Isolated testing and validation harness for PAI (Personal AI) hooks — the TypeScript hook system that extends Claude Code.

## Commands

```bash
bun test                    # Run all 131 tests
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
- `sandbox.ts` — Temp directory factory mimicking `~/.claude/` structure, env var isolation via `CLAUDE_CONFIG_DIR` + `PAI_DIR`
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
- `drift-detector.ts` — Diff source config vs live `~/.claude/` hooks
- `settings-validator.ts` — Schema validation of settings.json

## Conventions

- All Node.js imports use `node:` protocol (`import { join } from "node:path"`)
- Tests use sandbox isolation — never touch real `~/.claude/`
- External deps mocked: `PAI_INFERENCE_MOCK` (inference), stubs for `kitten`/`curl`
- Hook tests execute as subprocesses via `runner.ts`, matching Claude Code behavior
