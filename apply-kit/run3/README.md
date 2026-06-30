# Run 3 Apply-Kit — MCP on-demand + dead-refs + DAIDENTITY de-dup

PAI context de-bloat experiment, Run 3. **All config edits were applied INSIDE THE THROWAWAY
CLONE only.** No `~/.claude/**` or vault file was modified. LIVE files were read read-only for
measurement. Nothing was committed.

Clone: `/var/folders/.../pai-harness-1782775087997-m85jmz`

## Contents

| File | What |
|------|------|
| `mcp-savings-table.md` | Offline-measured token cost of all 5 MCP servers + savings |
| `budget-before-after.md` | Before/after `context-budget` against the clone (disabled rows drop out) |
| `claude.json.diff` | Clone `.claude.json` change (vslsp removed) — `diff -u` vs pre-edit backup |
| `settings.json.diff` | Clone `settings.json` changes (context7+atlassian disabled, dead ref removed) |
| `re-enable-guide.md` | Exact steps to turn vslsp / context7 / atlassian back on |
| `optional-patches.md` | OPTIONAL: ALGORITHM-SUMMARY alt, OPINIONS removal, DAIDENTITY de-dup |

## What was done (clone)

1. **vslsp → on-demand:** removed from `~/.claude.json` (clone) `mcpServers`. Recovers ~4,366 tok.
2. **context7 → on-demand:** `enabledPlugins["context7@..."] = false` in clone `settings.json`. Recovers ~1,317 tok.
3. **atlassian → on-demand:** `enabledPlugins["atlassian@..."] = false` in clone `settings.json`. Recovers its (unmeasured, remote) schema.
4. **chrome-devtools + playwright:** KEPT enabled (Dennis's decision).
5. **Dead ref removed:** dangling `PAI/ALGORITHM-SUMMARY.md` removed from `loadAtStartup.files`
   (it didn't resolve; was a no-op). Alternative repoint documented in `optional-patches.md`.

## Measured result

- **Always-on retained:** 11,632 tok (chrome-devtools 6,655 + playwright 4,977)
- **Recovered:** ~5,683 tok measured (vslsp + context7) + atlassian's unmeasured remote schema

## Harness code changes (in repo working tree, uncommitted)

- `src/analyzers/mcp-schema-cost.ts` — added `readPluginMcpServers()` (reads plugin-cache
  `.mcp.json` defs, flat + wrapped shapes, flags remote/no-command), a remote short-circuit in
  `measureMcpServer()`, and `measureAllServersIncludingPlugins()`.
- `bin/pai-harness.ts` — `context-budget --live-mcp --include-plugins` now also measures
  plugin servers.
- `tests/analysis/mcp-schema-cost.test.ts` — added tests for the new functions (stub-server
  framing). All 17 file tests pass; full suite 243 pass / 0 fail; `bun run check` exits 0.

## NOT done (out of scope — live hook edits)

- OPINIONS.md dead branch in `LoadContext.hook.ts` (benign, existsSync-guarded) — patch in
  `optional-patches.md`.
- DAIDENTITY conditional double-load in `CapabilityRecommender.hook.ts` (minor, only on
  identity-triggering prompts) — de-dup option in `optional-patches.md`.
