# PAI First-Prompt Context De-Bloat — Apply Kit

Reviewed diffs from an isolated full-fidelity clone. **Nothing here has been applied
to live config.** Apply during a quiet window; every step is reversible.

All measurements come from `bun bin/pai-harness.ts context-budget` run against the
clone (static always-on context) and `--live-mcp --include-plugins` (MCP tool schemas).

## Headline

| Bucket | Before | After | Recovered |
|---|---:|---:|---:|
| Static always-on (SKILL.md + CLAUDE.md + skill descriptions) | 48,325 tok | 31,631 tok | **−16,694** |
| MCP tool schemas made on-demand (vslsp + context7) | — | — | **−5,683** |
| atlassian MCP (remote/OAuth — real, unmeasurable offline) | — | — | + (unmeasured) |
| **Total measurable** | | | **≈ −22,377 tok** |

Per-source static deltas: `PAI/SKILL.md` 23,619→12,751 (−10,868) · `CLAUDE.md`
8,918→4,449 (−4,469) · skill descriptions 11,565→10,208 (−1,357).

Honest note: the original ~30–40K target assumed the `PAI/SKILL.md` Algorithm prose
was fully cuttable. It is not — the mandatory VISIBLE ALGORITHM PROGRESSION FORMAT
block (~38K ch) is the always-on output format the model must emit every turn and
cannot be lazy-loaded. ~22.4K is the zero-capability-loss ceiling; the DAIDENTITY
decision below can add ~2.4K more.

## CRITICAL apply mechanism (read first)

`~/.claude` is a symlink into the Obsidian vault. **`git apply` refuses to traverse
the symlink** ("beyond a symbolic link"). Apply every patch with GNU `patch` from
`$HOME`, OR with `git apply` against the resolved vault paths inside the vault repo.

```sh
# Mechanism A (recommended) — GNU patch from $HOME, follows the symlink:
cd "$HOME" && patch -p1 --dry-run < <patch>     # verify, then drop --dry-run

# Mechanism B — git apply inside the vault (these targets ARE git-tracked):
cd ~/Documents/Sunthings_AppStorage_EU_e2e && git apply <patch-with-vault-paths>
```

Git-tracking status of targets (matters for rollback):
- **git-tracked (vault repo):** `skills/PAI/SKILL.md`, `skills/Algorithm/**`, global
  `CLAUDE.md`, `settings.json`, the skill `SKILL.md` files, the ConsolidateLearnings hook.
- **NOT git-tracked:** `~/.claude.json` (MCP servers), `~/.claude/plugins/**`. Back these
  up manually before editing (see each step).

Recommended order: **2 → 3 → 4**. They touch disjoint files (no patch conflicts).

`<repo>` below = `/Users/Dennis.Dyall/Code/other/pai-harness`. Use absolute
`<repo>/apply-kit/...` paths for patch files since several steps `cd "$HOME"`.

---

## Step 1 — (Run 1) No live changes
Run 1 built the measurement harness + isolation clone in the git repo
(`/Users/Dennis.Dyall/Code/other/pai-harness`). Already committed there. Nothing to apply.

## Step 2 — (Run 2) Slim `PAI/SKILL.md` → relocate reference to `/Algorithm`  (−10,868 tok)
Files: `apply-kit/run2/`
1. Create the new on-demand reference files (no live baseline — copy in):
   ```sh
   mkdir -p ~/.claude/skills/Algorithm/Reference
   cp <repo>/apply-kit/run2/new-Algorithm-Reference/{ISC,PRD,Concept,Capabilities}.md \
      ~/.claude/skills/Algorithm/Reference/
   ```
2. Patch the two skill files:
   ```sh
   cd "$HOME"
   patch -p1 < <repo>/apply-kit/run2/PAI-SKILL.md.patch
   patch -p1 < <repo>/apply-kit/run2/Algorithm-SKILL.md.patch
   ```
   `PAI/SKILL.md` keeps all 10 always-on behavioral blocks (RESPONSE DEPTH SELECTION,
   the MANDATORY format block, No Silent Stalls, Discrete Phase Enforcement, Phase
   Discipline Checklist, Context Loading, etc.); only reference detail moved out.
- Rollback: `cd ~/Documents/Sunthings_AppStorage_EU_e2e && git checkout -- <SKILL paths>`;
  `rm -r ~/.claude/skills/Algorithm/Reference`.

## Step 3 — (Run 3) MCP/plugin on-demand + dead-ref  (−5,683 tok + atlassian)
Files: `apply-kit/run3/` (see `re-enable-guide.md`, `mcp-savings-table.md`)
Keep chrome-devtools + playwright; make **vslsp, context7, atlassian** on-demand.
> The `.diff` files in `run3/` reference the throwaway clone — **do not `patch`/`git
> apply` them directly.** They are the authoritative reference for the small manual
> edits below (one key removal + two `enabledPlugins` flips + one `loadAtStartup` entry).
1. **vslsp** (`~/.claude.json`, NOT git-tracked — back up first):
   ```sh
   cp ~/.claude.json ~/.claude.json.bak
   ```
   Remove the `vslsp` key from `mcpServers` (see `claude.json.diff`).
2. **context7 + atlassian** (`settings.json enabledPlugins`): set both to `false`
   (see `settings.json.diff`).
3. **Dead ref:** remove the dangling `PAI/ALGORITHM-SUMMARY.md` entry from
   `settings.json loadAtStartup.files` (see `settings.json.diff`).
- Re-enable later: follow `apply-kit/run3/re-enable-guide.md` (vslsp via `.claude.json`;
  context7/atlassian via `enabledPlugins: true`; restart the session).
- Rollback: restore `~/.claude.json.bak`; revert `settings.json` in the vault repo.

## Step 4 — (Run 4) Trim CLAUDE.md GRADUATED_RULES (generator) + skill descriptions  (−5,826 tok)
Files: `apply-kit/run4/`
1. **Generator patch** (durable — the block is auto-generated; editing CLAUDE.md
   directly would be clobbered):
   ```sh
   cd "$HOME" && patch -p1 < <repo>/apply-kit/run4/ConsolidateLearnings.ts.patch
   ```
   The patched generator writes the full rule set to
   `~/.claude/MEMORY/graduated-rules.md` and keeps only a pointer + composite-ranked
   top-N inline. It is CUMULATIVE (migrates the existing block on first run, never
   overwrites with a partial batch) and throws on malformed markers.
2. **Take effect immediately** (otherwise the shrink only happens on the next
   consolidation run): run the patched consolidator once, or manually replace the
   `<!-- GRADUATED_RULES_START -->…END` block in `CLAUDE.md` with the pointer + top-N
   and write the full set to `~/.claude/MEMORY/graduated-rules.md`. Verify with
   `bash apply-kit/run4/test-generator.sh` (proves no rule loss).
3. **Skill descriptions:**
   ```sh
   cd "$HOME"
   for s in ISA ArXiv Migrate BitterPillEngineering; do
     patch -p1 < <repo>/apply-kit/run4/skill-descriptions/$s.SKILL.md.patch
   done
   ```
- Rollback: revert the hook + the four skill `SKILL.md` files **and `CLAUDE.md`** in the
  vault repo (`cd ~/Documents/Sunthings_AppStorage_EU_e2e && git checkout -- <paths>`),
  then `rm ~/.claude/MEMORY/graduated-rules.md`. Reverting `CLAUDE.md` is required —
  the generator rewrites the vault `CLAUDE.md` block; deleting only the ref file would
  leave the inline pointer aimed at a missing file.

---

## Decisions for you (NOT applied — your call)

1. **DAIDENTITY inversion (~−2,422 tok on every non-identity prompt).** `DAIDENTITY.md`
   loads on EVERY prompt via `loadAtStartup`, while `CapabilityRecommender.hook.ts`
   already injects it conditionally when identity is needed. Removing it from
   `loadAtStartup` would save ~2,422 tok/prompt but means identity context is absent on
   prompts the classifier deems non-identity — a behavior change. Patch sketch in
   `apply-kit/run3/optional-patches.md`. **Default: not applied.**
2. **ALGORITHM-SUMMARY.md.** Currently REMOVED from `loadAtStartup` (was a dangling
   path). Alternative: repoint to `skills/PAI/ALGORITHM-SUMMARY.md` to actually load the
   2.2K summary (+~640 always-on tok) — only if you want it. **Default: stays removed.**
3. **OPINIONS.md dead branch** in `LoadContext.hook.ts` — benign `existsSync`-guarded
   no-op (0 tok). Optional cleanup patch in `apply-kit/run3/optional-patches.md`.

## Verification after applying
```sh
# In the repo, point the budget tool at LIVE config:
bun bin/pai-harness.ts context-budget                       # expect static ≈ 31.6K tok
bun bin/pai-harness.ts context-budget --live-mcp --include-plugins   # vslsp/context7 gone
```
Confirm `/Algorithm` resolves and its Reference/ files load; spot-check the 4 trimmed
skills still route (descriptions retain USE-WHEN keywords); confirm CLAUDE.md shows the
graduated-rules pointer and `~/.claude/MEMORY/graduated-rules.md` holds the full set.
