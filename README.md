# pai-harness

Isolated testing and validation harness for [PAI](https://github.com/dennisdyallo) hooks — the TypeScript hook system that extends [Claude Code](https://claude.com/claude-code).

PAI hooks are opaque and fragile. They fail silently, data flow chains break without detection, context injection is invisible, and OS side effects fire unexpectedly. This harness provides full visibility and regression testing in an isolated sandbox.

## Features

- **Sandbox isolation** — Temp directories with `CLAUDE_CONFIG_DIR` + `PAI_DIR` env var redirection. Never touches real `~/.claude/`.
- **Subprocess hook execution** — Runs hooks via `Bun.spawn()` matching how Claude Code executes them.
- **131 tests** across unit, integration, and analysis categories.
- **Mock API server** — Local `Bun.serve` that mimics the Anthropic Messages API. Run full Claude Code sessions with controlled responses via `ANTHROPIC_BASE_URL`.
- **Live debugging** — JSONL hook I/O logging, session log parsing, invocation replay.
- **Static analysis** — Hook dependency graphs, context token budgets, config drift detection, output schema validation.
- **Error injection** — Crash, corrupt output, timeout, and state corruption testing.

## Install

```bash
cd ~/Code/pai-harness
bun install
```

## Usage

### Run tests

```bash
bun test                              # All tests
bun test tests/unit                   # Unit tests only
bun test tests/integration            # Integration tests only
bun test --filter "SecurityValidator" # Single hook
```

### Lint and type check

```bash
bun run lint          # Biome lint
bun run typecheck     # tsc --noEmit
bun run check         # Both combined
```

### CLI

```bash
bun bin/pai-harness.ts --help

# Run a hook in sandbox
bun bin/pai-harness.ts run SecurityValidator --event PreToolUse

# Validate state files
bun bin/pai-harness.ts validate state
bun bin/pai-harness.ts validate drift
bun bin/pai-harness.ts validate settings

# Context analysis
bun bin/pai-harness.ts context --tokens

# Hook dependency graph
bun bin/pai-harness.ts graph
bun bin/pai-harness.ts graph --dot
bun bin/pai-harness.ts graph --check

# Benchmark hooks
bun bin/pai-harness.ts bench
bun bin/pai-harness.ts bench --hook LoadContext

# Mock API server (digital twin)
bun bin/pai-harness.ts mock-api start --scenario basic-session

# Session log analysis
bun bin/pai-harness.ts logs
bun bin/pai-harness.ts logs --hooks-only
bun bin/pai-harness.ts logs --errors

# Live hook I/O tail
bun bin/pai-harness.ts live tail

# Replay captured invocations
bun bin/pai-harness.ts replay <logfile>
```

### Digital Twin Mode

Run real Claude Code with controlled model responses and full hook execution:

```bash
# Start mock API server
bun bin/pai-harness.ts mock-api start --scenario tool-use

# In another terminal, run Claude Code pointing at the mock
CLAUDE_CONFIG_DIR=/tmp/sandbox ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

## Project Structure

```
pai-harness/
├── bin/pai-harness.ts                  # CLI entry point
├── src/
│   ├── core/                           # Sandbox, runner, fixtures, types
│   ├── analyzers/                      # Dependency graph, context, tokens, output schema
│   ├── live/                           # Interceptor, log parser, replay
│   ├── mock-api/                       # Mock Anthropic API server + scenarios
│   ├── mocks/stubs/                    # Stub binaries (kitten, curl)
│   └── sync/                           # Drift detector, settings validator
├── tests/
│   ├── unit/hooks/                     # Per-hook unit tests
│   ├── unit/lib/                       # Library unit tests (paths, identity, hook-io)
│   ├── unit/mock-api/                  # Mock API server tests
│   ├── integration/                    # Cross-hook flow tests
│   ├── analysis/                       # Context budget, drift, output schema tests
│   └── fixtures/                       # Test data (settings, state files)
├── biome.json                          # Linter config
├── tsconfig.json                       # TypeScript config
└── package.json
```

## Key Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAUDE_CONFIG_DIR` | Native Claude Code config redirect (highest priority) |
| `PAI_DIR` | PAI's own config directory override |
| `ANTHROPIC_BASE_URL` | Redirect API calls to mock server |
| `PAI_INFERENCE_MOCK` | Read inference responses from file instead of calling API |
| `PAI_HOOK_LOG_LEVEL` | Hook logging verbosity: debug, info, warn, error |
| `PAI_HARNESS_LOG` | Path to JSONL file for live hook I/O logging |

## License

Private.
