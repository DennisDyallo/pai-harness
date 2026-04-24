# Handoff — AgentTierContext Hook Fix

**Date:** 2026-04-24
**Branch:** main (pai-harness)
**Last commit:** 996166b Add CLAUDE.md and README.md
**Hook location:** `~/.claude/hooks/AgentTierContext.hook.ts` (not version-controlled in pai-harness)

---

## Session Summary

Fixed the AgentTierContext hook so that receiver tier resolves correctly when no explicit `model` param is passed in Agent tool calls. Previously, spawning e.g. `Agent(subagent_type: "Engineer")` without `model: "sonnet"` would show `Receiver tier: unknown`, causing trust mode to fall back to "peer skepticism" instead of the correct "Higher → Lower (trust and execute)". Wrote an integration test suite in pai-harness covering all tier combinations.

## Current State

### Committed Work
No new commits in pai-harness yet. The changes are ready to commit.

### Uncommitted Changes

**pai-harness repo (`~/Code/other/pai-harness/`):**
- `CLAUDE.md` — modified (added `--bare` mode documentation, done by a prior session's formatter)
- `tests/integration/agent-tier-context.test.ts` — **new file**, 12 test cases

**Hook file (outside repo, at `~/.claude/hooks/`):**
- `AgentTierContext.hook.ts` — three changes applied directly:
  1. Added `AGENT_DEFAULT_TIERS` map (Engineer=sonnet, Architect=opus, Explore=haiku, Plan=opus, QATester=sonnet, Designer=opus, Intern=sonnet, Algorithm=opus)
  2. Rewired `main()` with 3-way receiver resolution: explicit model → agent default map → unknown
  3. `detectOrchestratorTier()` now reads `CLAUDE_CONFIG_DIR` env var before falling back to `~/.claude/`

### Build & Test Status
- `bun test --filter "agent-tier"` — **12/12 pass** (all new tests)
- `bun test` (full suite) — **104 pass, 9 fail** (pre-existing failures in LoadContext, hook-io, identity, paths — not related to this work)

### Worktree / Parallel Agent State
None.

---

## Readiness Assessment

**Target:** PAI developers who need the hook system to correctly inject trust-calibration metadata into agent dispatches, so that the asymmetric trust principle (Opus→Sonnet = "trust and execute", Haiku→Opus = "recover intent") works automatically.

| Need | Status | Notes |
|---|---|---|
| Receiver tier resolves when `model` param is explicit | ✅ Working | Was already working, now tested |
| Receiver tier resolves when `model` param is omitted | ✅ Working | Fixed — uses `AGENT_DEFAULT_TIERS` fallback map |
| Trust mode reflects actual capability gap | ✅ Working | All 5 trust combinations tested (Higher→Lower, Lower→Higher, Equal, Unknown) |
| Display string shows resolution source | ✅ Working | Shows "sonnet (default for Engineer)" instead of "unknown" |
| Sandbox isolation for testing | ✅ Working | Fixed `detectOrchestratorTier()` to respect `CLAUDE_CONFIG_DIR` |
| Pre-existing test suite unaffected | ⚠️ Partial | 9 pre-existing failures (LoadContext, lib modules) — not caused by this work |

**Overall:** 🟢 Production — the hook fix is complete and tested; the specific bug (unknown receiver tier) is resolved for all known agent types.

**Critical next step:** Commit the pai-harness test file and decide whether to track the hook file itself in a repo (currently it lives only in `~/.claude/hooks/` with no version control).

---

## What's Next (Prioritized)

1. Commit the new test file and CLAUDE.md changes in pai-harness
2. Consider version-controlling `AgentTierContext.hook.ts` (currently only in `~/.claude/hooks/`, which is symlinked from the Obsidian vault but not git-tracked in pai-harness)
3. Fix the 9 pre-existing test failures (LoadContext relies on modules that may have moved; `lib/hook-io`, `lib/identity`, `lib/paths` modules are missing)
4. Add agent types to `AGENT_DEFAULT_TIERS` if new agent types are added to PAI

## Blockers & Known Issues

- The `AGENT_DEFAULT_TIERS` map is a static copy of the agent→model mapping from CLAUDE.md. If model defaults change, the map must be updated manually in both places.
- Pre-existing test failures in pai-harness (9 tests) are unrelated but should be addressed eventually.

## Key File References

| File | Purpose |
|------|---------|
| `~/.claude/hooks/AgentTierContext.hook.ts` | The hook that was fixed — injects tier metadata into agent prompts |
| `~/Code/other/pai-harness/tests/integration/agent-tier-context.test.ts` | New integration test (12 cases) |
| `~/Code/other/pai-harness/src/core/sandbox.ts` | Sandbox isolation — sets `CLAUDE_CONFIG_DIR` for the hook |
| `~/Code/other/pai-harness/src/core/runner.ts` | Subprocess hook executor used by tests |
| `~/.claude/CLAUDE.md` | Contains the Model Tier Awareness doctrine and agent→model defaults |

---

## Quick Start for New Agent

```bash
# Run the new tests
cd ~/Code/other/pai-harness
bun test --filter "agent-tier"

# Run full suite
bun test

# View the hook
cat ~/.claude/hooks/AgentTierContext.hook.ts

# Check the agent default tier map (line 61-70)
sed -n '61,70p' ~/.claude/hooks/AgentTierContext.hook.ts
```

Use `/resume-handoff` to pick up where this left off.
