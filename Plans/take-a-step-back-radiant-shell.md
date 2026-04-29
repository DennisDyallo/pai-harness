# Fix PackageAudit shell-token false-positives

## Context

The PackageAudit PreToolUse hook (`~/.claude/hooks/PackageAudit.hook.ts`,
which is a symlink into the vault source at
`~/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Hooks/PackageAudit.hook.ts`)
auto-blocked the command:

```
bun add -D --exact @biomejs/biome 2>&1 | tail -20
```

Root cause: the parser splits compound commands only on `&&`, `;`, `||`. It
does **not** treat the single pipe `|` or shell redirections (`2>&1`, `>`,
`<`, `&>`, …) as boundaries. The post-pipe and redirection tokens
(`2>&1`, `|`, `tail`) leak into `extractPackages` and get audited against
npm. `2>&1` and `|` 404 on the npm registry → `versionCount=0 && ageDays=0`
→ `riskScore = 100` → hard block.

A second bug then misreports *why* the block fired: the block-message
string is hardcoded to "Package is too new or has zero downloads", but
the real triggering signal in this case is `NOT FOUND IN REGISTRY`. This
made the failure look contradictory in the user-visible output (the
report showed `Risk: LOW` for `tail` but the trailing line claimed the
opposite).

Intended outcome: the hook ignores everything after a shell pipe or
redirection, never audits non-package tokens, and — when it does block —
explains the actual triggering signal.

## Taxonomy of issues

| # | Bug | Location | Symptom |
|---|-----|----------|---------|
| A | Pipe `\|` not treated as segment separator | `isInstallCommand`, `extractPackages` (regex `/(?:&&\|;\|\\|\\|)/`) | Tokens after `\| cmd` audited as packages |
| B | Shell redirection tokens not skipped | `SKIP_PATTERNS` | `2>&1`, `>file`, `&>`, `<in`, etc. audited as packages |
| C | Misleading auto-block message | Line 618 in `PackageAudit.hook.ts` | Hardcoded "too new or zero downloads" regardless of actual signal |
| D | Real shell tools that exist on npm (`tail`, `cat`, `grep`) trigger false audits | Consequence of A+B | Resolved once A+B fixed; needs regression test |
| E | Sanity: package collection should stop at first pipe/redir even within a single segment | `extractPackages` token loop | Belt-and-braces against future segment-split bypasses |

## Recommended fix

### 1. Tokenize properly in the hook (vault source file)

File: `~/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Hooks/PackageAudit.hook.ts`

- **Segment split**: change the regex used in both `isInstallCommand`
  (line 99) and `extractPackages` (line 122) from
  `/\s*(?:&&|;|\|\|)\s*/` to a regex that also splits on a single
  pipe **but not** the double pipe `||`:
  `/\s*(?:&&|;|\|\||\|&|(?<!\|)\|(?!\|))\s*/`
  (or, equivalently, pre-collapse `||` to a sentinel, split on `|`,
  restore — whichever is more readable). Single source of truth: extract
  to a `splitShellSegments(cmd)` helper and call it from both places.

- **Stop tokens**: in `extractPackages`'s token loop (line 133), break
  the loop as soon as a token matches a redirection or pipe operator:
  `|`, `|&`, `>`, `>>`, `<`, `<<`, `2>`, `2>>`, `2>&1`, `&>`, `&>>`, `1>`, `1>>`, `&`.
  Anything after that is shell plumbing, never a package.

- **SKIP_PATTERNS additions** (defense in depth, in case a redir token
  appears without surrounding whitespace): add patterns matching
  `^\d*[<>]&?\d*$` (covers `2>`, `2>&1`, `1>&2`, `>&`, etc.) and `^[|&]+$`.

- **Block message** (line 618): replace the hardcoded string with the
  actual signal from the offending profile, e.g.:
  ```ts
  const blocker = profiles.find(p => p.riskScore >= 100);
  const reason = blocker?.signals.find(s =>
    s === 'NOT FOUND IN REGISTRY' || s === 'VERY NEW (<7 days)' || s === 'ZERO DOWNLOADS'
  ) ?? 'critical risk score';
  console.error(`\n⛔ Auto-blocked: ${blocker?.name} — ${reason}.`);
  ```

### 2. Tests in pai-harness (the failing test bed)

New file: `tests/unit/hooks/PackageAudit.test.ts`

The harness already executes hooks by absolute path
(`${HOME}/.claude/hooks/X.hook.ts` — see
`tests/unit/hooks/SecurityValidator.test.ts:8`). PackageAudit follows
the same `PreToolUse` shape, so we reuse:

- `makePreToolUseInput` — `src/core/fixtures.ts`
- `runHook` — `src/core/runner.ts`
- `createSandbox` — `src/core/sandbox.ts`
- `validateHookOutput` — `src/analyzers/output-validator.ts`

Test cases (each one a regression-locked behavior):

1. **non-install passes** — `echo hello` → `exit 0`, `{continue:true}`.
2. **plain install of well-established package passes** —
   `bun add lodash` → `exit 0` (auto-pass). *Hits real npm; mark with
   `if (process.env.PAI_HARNESS_OFFLINE) test.skip()` for offline CI.*
3. **🟥 Bug A regression** — `bun add @biomejs/biome 2>&1 | tail -20`
   → `exit 0`, packages list (recovered via stderr report) contains
   only `@biomejs/biome`, never `tail`/`|`/`2>&1`.
4. **🟥 Bug B regression** — `npm install lodash > /tmp/out.log 2>&1`
   → audits only `lodash`.
5. **🟥 Bug D regression** — `npm install foo | grep bar` does not
   audit `grep` or `bar`.
6. **double-pipe still splits** — `npm install foo || echo failed`
   audits `foo` only (pre-existing behavior must not regress).
7. **single-pipe install command still detected** — `bun add foo 2>&1`
   is still recognized as an install (not silently passed through).
8. **🟥 Bug C regression** — when a block fires, stderr contains the
   actual signal name (`NOT FOUND IN REGISTRY` / `VERY NEW` / `ZERO
   DOWNLOADS`) and the offending package name, not the generic string.
   Use a synthetic input (a guaranteed-404 package name like
   `pai-harness-nonexistent-${Date.now()}`) to drive this
   deterministically.
9. **install with no package args passes** — `npm install`
   (restore-from-package.json) → `{continue:true}`.

Network-touching tests (#2, #3, #4, #5, #8) get a `PAI_HARNESS_OFFLINE`
escape hatch; pure parser-shape tests (#1, #6, #7, #9) are network-free.

### 3. Promotion to prod

Because `~/.claude/hooks/PackageAudit.hook.ts` is a symlink into the
vault, the "fix" and the "promotion" are the same edit. Promotion =
commit the vault file. Steps once tests pass:

1. Run `bun test --filter PackageAudit` in pai-harness — all green.
2. Run `bun run check` (lint + typecheck) — clean.
3. Manually replay the original failing command via `claude --bare`
   with the hook enabled, confirm `@biomejs/biome` audit completes and
   `tail` is not audited.
4. `git add` + commit the vault source file, push.

## Files to modify

| Path | Change |
|------|--------|
| `~/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Hooks/PackageAudit.hook.ts` | Bugs A–C fix (segment split, stop-tokens, SKIP_PATTERNS, block message) |
| `pai-harness/tests/unit/hooks/PackageAudit.test.ts` | New file, ~9 test cases above |

No new dependencies, no new harness infrastructure required.

## Verification

```bash
cd /Users/Dennis.Dyall/Code/other/pai-harness
bun test --filter PackageAudit                # new tests green
bun test                                      # no regressions in 143 existing
bun run check                                 # lint + typecheck clean

# End-to-end smoke against the real hook + real registries:
echo '{"session_id":"smoke","tool_name":"Bash","tool_input":{"command":"bun add -D --exact @biomejs/biome 2>&1 | tail -20"}}' \
  | bun ~/.claude/hooks/PackageAudit.hook.ts
# Expect: stderr report mentions ONLY @biomejs/biome; exit code 0 (auto-pass) or {decision:"ask"}; no mention of tail/2>&1/|.
```
