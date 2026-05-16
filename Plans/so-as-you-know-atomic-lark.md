# PAI v5 Upgrade Evaluation

## Context

You're on a heavily forked PAI v4 (Obsidian-vault-as-source-of-truth, 81 skills with 48 custom, 36 hooks mostly custom, 14 agents standard). Miessler dropped v5.0.0 — a structural rewrite, not a feature drop. Question: is it worth upgrading?

**TL;DR recommendation: Don't upgrade in place. Selectively port 3–4 ideas.** The v5 install script backs up `~/.claude/` and replaces it — your vault-symlinked setup and 48 custom skills would be functionally destroyed. The genuinely valuable v5 concepts can be ported as discrete changes without taking on Pulse, DA, or the constitutional prompt.

## What v5 actually is

v5 is **three big structural bets** wrapped in a lot of skill/hook additions:

1. **Pulse** — a single bun daemon at port 31337 replacing scattered scripts (voice, observability, cron, dashboard) + a Next.js Life Dashboard with 22 routes. Runs as launchd.
2. **DA (Digital Assistant) identity layer** — every install picks a named DA (you already have "Sia"), loaded via `DA_IDENTITY.md` + `PRINCIPAL_IDENTITY.md`. New `/interview` flow.
3. **Algorithm v6.3.0 + ISA** — formalizes the 7-phase loop you already run (it was v3.6.0 in v4), adds a Sonnet-backed mode classifier, effort tiers E1–E5, and **ISA** (Ideal State Artifact) — a 12-section PRD replacement with strict ID-stability rules.

Plus: ContainmentGuard hook, ShadowRelease tool (12 security gates for public release), Memory v7.6 split (WORK/KNOWLEDGE/LEARNING/RELATIONSHIP/OBSERVABILITY/STATE), 45 public skills, flat `skills/Foo/` (was nested `skills/Category/Foo/`).

## What's genuinely new vs. what you already have

| v5 feature | Your current state | Verdict |
|---|---|---|
| DA identity layer | Sia is already wired in `settings.json` with absolute precedence | **Already have it.** v5 just formalizes. |
| Algorithm 7 phases | You run the same 7 phases (OBSERVE→...→LEARN), enforced by `CapabilityRecommender` | **Already have it.** v5 adds mode classifier + ISA. |
| ISA (12-section structured PRD) | You use `Plans/*.md` + handoffs, no enforced schema | **Genuinely new and worth porting.** |
| Pulse daemon | Scattered: your own daemons + launchd services + Pulse port 31337 | **Skip.** Would conflict with your existing daemon zoo (`Ping`, `OneMessage`, `RestartNanoclaw`, etc.) |
| Life Dashboard (Next.js, 22 routes) | None | **Skip unless you want to commit to it.** Big surface area, slow to maintain. |
| ContainmentGuard hook | None — you rely on git + review | **Worth porting.** Cheap, structural. |
| ShadowRelease (12-gate public release) | `commit-local-changes` + `security-review` | **Worth borrowing the gate list.** You already do similar but ad-hoc. |
| Memory v7.6 directory split | Your `~/.claude/MEMORY/{LEARNING,WISDOM,STATE}` already split | **Mostly have it.** Could adopt KNOWLEDGE typed-graph idea. |
| Flat skill structure | Already flat | **Already have it.** |
| Custom hooks (RatingCapture, RelevantLearnings, AutoWorkCreation, etc.) | All 36 are yours — none upstream | v5 would clobber. |
| 45 public skills | You have 81 (48 are yours) | v5's additions are mostly already in your set (Council, RedTeam, Evals, ExtractWisdom, etc.) |

## Upgrade cost (if done in-place)

The v5 installer runs `curl -sSL https://ourpai.ai/install.sh | bash` and **moves `~/.claude/` to `~/.claude.backup-{TIMESTAMP}`**. For you that means:

- Your Obsidian-vault symlink chain (`~/.claude` → vault `_System/PAI/`) breaks. v5 expects to own the directory.
- 48 custom skills, 36 custom hooks, 14 agent definitions, all `Identity/` files, `MEMORY/` learning signals, `state/` — all need manual re-merge from backup.
- `settings.json` is heavily yours (Sia identity, hooks chain, MCP servers, permissions). Would need 3-way merge.
- Plus rebuilding all symlinks vault-side.

Realistic effort: **2–3 full days** of careful merging, with high regression risk on the learning/memory hooks that have years of signal in them.

## Recommended approach: cherry-pick, don't migrate

Port these v5 ideas as discrete changes over a week or two — each is testable in isolation:

1. **ISA skill (highest value).** Adopt the 12-section template + ID-stability rules for your `Plans/` and handoff docs. Builds on what you already do. Net new value: forced verification section, stable ISC IDs across iterations. ~half day.
2. **ContainmentGuard PreToolUse hook.** Cheap structural defense; aligns with your existing `QualityGate`/`LintEnforcer` pattern. ~2 hours.
3. **ShadowRelease gate list.** Borrow the 12-gate checklist (zone deletion, trufflehog, .env, reference integrity, etc.) and wire into your existing `commit-local-changes` skill. ~2 hours.
4. **Skim v5's new skills** (ArXiv, BitterPillEngineering, ApertureOscillation, ContextSearch, Knowledge, Migrate, Optimize, RootCauseAnalysis, SystemsThinking, Webdesign, WorldThreatModel) for anything you want — clone individually.

**Skip:** Pulse (conflicts with your daemon setup), Life Dashboard (maintenance burden, you have your vault), Constitutional system prompt (you already have the same enforcement via `CapabilityRecommender` + Algorithm depth classifier), full Memory v7.6 reshuffle (yours works).

## Critical files (for the cherry-pick path)

- v5 source: `~/Code/other/Personal_AI_Infrastructure/` — read `Packs/ISA/`, `Packs/ContainmentGuard/`, `Tools/ShadowRelease.ts`
- Your skill home: `~/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Skills/` (symlinked to `~/.claude/skills/`)
- Your hook home: same vault, `Hooks/`
- Your handoff/plan pattern: `~/Code/other/pai-harness/Plans/` — extend with ISA template

## Verification

- After porting ISA: write one real plan in the 12-section format, confirm ID-stability rule works across an edit cycle.
- After ContainmentGuard: try to Write outside an allowed zone in a sandbox, confirm block.
- After ShadowRelease gate list: dry-run on this repo, confirm no false positives.
- No regression check needed for skipped pieces (they're additive non-adoptions).

---

## Deep-dive on the cherry-pick candidates (added round 2)

### ContainmentGuard — what it actually is
A **PreToolUse hook** that blocks `Write`/`Edit`/`MultiEdit` (not Bash) from touching files outside declared "zones." Zones are glob patterns in a single `containment-zones.ts` file. v5 ships 4 zones:

- **Z1 user-data:** `PAI/USER/**` (identity, TELOS, contacts, finances, health)
- **Z2 config-secrets:** `settings.json`, `.env*`
- **Z3 runtime-memory:** `PAI/MEMORY/**`
- **Z4 private-skills:** `skills/_*/**` (underscore prefix = private)

It's structural: runs on every tool call, persists across sessions. Same zones are reused by ShadowRelease as the "do not publish" list — one source of truth for "what's private."

**Verdict for you:** Genuinely useful — and on reflection (Cato catch 2026-05-16), more important than I first framed. My earlier rationale that "vault-symlinked setup creates de facto containment" was **backwards**: a symlinked vault actually *increases* damage radius, because mistaken Write/Edit/MultiEdit calls land directly in the source-of-truth vault that holds your TELOS, identity, learning history, and credentials. There is no copy-and-undo barrier. The real win of ContainmentGuard is exactly the write-boundary enforcement that the vault topology removes. Reclassified as **worth porting in Phase C** alongside the Algorithm weave — small hook, big damage-radius reduction. Defining the zone list also gives ShadowRelease its "do not publish" source of truth as a free side-effect.

### ShadowRelease — what it actually is
A **publishing pipeline for sharing a sanitized PAI install publicly** (think: open-sourcing your `.claude/` minus the personal bits). Stages into `~/.claude/PAI_RELEASES/PAI_Release_v{X}/` and runs 5 gates:

1. Zone deletion check — forbidden files are absent
2. Identity grep — no personal name/email patterns
3. Cloudflare ID grep — no hardcoded account/KV IDs
4. trufflehog — no live secrets
5. `.env` strays check

Stage and publish are separate commands. Never auto-publishes.

**Verdict for you:** Only relevant if you plan to publish your PAI extensions publicly (à la a personal fork of Miessler's). Otherwise irrelevant — your private repo + commit hooks already cover the same risk surface. **Skip.**

### Constitutional system prompt — the 5 most interesting rules verbatim

> "This rule has the highest enforcement priority in the system. Violating it is a CRITICAL FAILURE regardless of how correct the underlying work is. A short, properly-formatted response beats the most thorough freeform prose."

> "Mode and tier are decided by a Sonnet classifier at UserPromptSubmit, not by you. You read this line and obey it. No regex layer. No model-judgment fallback."

> "Never use `claude --bare` in spawned subprocesses. The `--bare` flag forces `ANTHROPIC_API_KEY` auth and bypasses OAuth/keychain — billed $498 in April 2026 from Pulse heartbeats."

> "The infrastructure is the memory. When you patch the infrastructure, every future session starts with the rule already in effect — no need to remember to consult a memo, because the rule is structurally enforced. That's self-healing."

> "Browser-verify all web output... Interceptor is the ONLY sanctioned browser automation in PAI — real Chrome, no CDP detection, real login sessions, accurate rendering. Playwright is BANNED."

**Verdict for you:**
- The **"infrastructure is the memory"** principle is the best line in the whole document. You already do this implicitly via hooks; might be worth a one-liner in your global CLAUDE.md.
- The **`--bare` billing warning** is directly relevant — your pai-harness uses `--bare` for tests. Worth noting in `pai-harness/CLAUDE.md` that `--bare` requires `ANTHROPIC_API_KEY` and skips OAuth (you actually already have this documented, but the $498 bill is a useful war story).
- The **Sonnet classifier authority** rule — you already enforce this via `CapabilityRecommender`. Nothing new.
- The **Interceptor-only / Playwright-banned** rule — strong stance, but you have Playwright + Chrome DevTools both wired and use them legitimately. **Don't adopt.**
- Overall: the constitutional prompt is mostly things you already enforce via hooks, but harder to override. **Don't adopt wholesale** — cherry-pick the "infrastructure is the memory" framing.

### New v5 skills worth considering

| Skill | What it does | Worth importing? |
|---|---|---|
| **Knowledge** | Typed knowledge archive (People/Companies/Ideas/Research) with 3-pass search + wikilink graph | **Yes** — fits your Obsidian vault model. |
| **Migrate** | Ingest external content (.md, Obsidian, Notion, Apple Notes) into PAI taxonomy with provenance | **Yes** — if you ever onboard external knowledge dumps. |
| **WorldThreatModel** | Adversarial testing of ideas/strategies across 11 time horizons (6mo→50yr), 11 parallel agents | **You already have `WorldThreatModelHarness`** — check if v5's is a refinement. |
| **Optimize** | Autonomous hill-climb for any target (code via shell metrics, text via LLM-as-judge) | **Yes** — high leverage, generalizable. |
| **RootCauseAnalysis** | Structured incident analysis (5 Whys, Fishbone, Postmortem, Fault Tree, Kepner-Tregoe) | **Maybe** — useful when debugging is opaque. |
| **SystemsThinking** | Iceberg/Causal Loop/Archetype/Leverage analysis | **Maybe** — overlaps with your `FirstPrinciples`. |
| **Ideate** | 9-phase evolutionary ideation (CONSUME→DREAM→...→EVOLVE→META-LEARN) | **Maybe** — overlaps with `BeCreative`. |
| **ApertureOscillation** | 3-pass narrow/wide/synthesis scope shifting | **Maybe** — small, composable. |
| **BitterPillEngineering** | Audits instruction sets for over-prompting; classifies rules CUT/MERGE/SHARPEN | **Yes** — could run on your own CLAUDE.md. |
| **ArXiv** | Paper search via arXiv Atom API + AlphaXiv summaries | **Yes** — small, useful. |
| **ContextSearch** | Cold-start context recovery across registry/work.json/MEMORY/git | You have `ResumeHandoff`; check overlap. |
| **Webdesign** | Claude Design (claude.ai/design) integration via Interceptor | Skip — couples to Interceptor. |

## Final summary

- **Definitely port:** ISA (the 12-section structured PRD/plan format).
- **Worth a look:** Knowledge, Migrate, Optimize, BitterPillEngineering, ArXiv (low-risk additive skill clones).
- **Borrow framing only:** "infrastructure is the memory" line for your global CLAUDE.md.
- **Skip:** Pulse, Life Dashboard, Constitutional prompt wholesale, ContainmentGuard, ShadowRelease, Interceptor migration.
- **Cross-check (don't re-import blindly):** WorldThreatModel vs your existing `WorldThreatModelHarness`; ContextSearch vs `ResumeHandoff`; Ideate vs `BeCreative`; SystemsThinking vs `FirstPrinciples`.

---

## Round 3: Concrete porting plan

After inspecting the actual skill source, here's the revised order with real cost numbers.

### Tier A — Port these (high value, clean deps)

**1. ISA skill — 22 files, ~3,750 lines, self-contained**
- **No hard deps:** Doesn't need Pulse, constitutional prompt, ContainmentGuard, or the mode classifier. Algorithm invokes ISA, not the other way around.
- **The 12 sections (fixed order):** Problem · Vision · Out of Scope · Principles · Constraints · Goal · Criteria · Test Strategy · Features · Decisions · Changelog · Verification
- **Tier gating** (this is the actual leverage): E1 = Goal+Criteria only · E2 adds Problem+Test Strategy · E3 adds Vision/Out of Scope/Constraints/Features · E4 = all 12 · E5 = all 12 + mandatory Interview pre-BUILD. Project ISAs always ≥ E3.
- **ID-stability rule:** ISC IDs never renumber on edit. Split → `ISC-7.1`, `ISC-7.2`. Drop → tombstone `[DROPPED — see Decisions YYYY-MM-DD]`. This is what makes Reconcile safe across parallel agents.
- **6 workflows:** Scaffold (fresh ISA) · Interview (deepen prose) · CheckCompleteness (tier gate scoring) · Reconcile (merge ephemeral feature-file back to master, keyed on stable IDs) · Seed (bootstrap from README+git log) · Append (writes Decisions/Changelog/Verification with Deutsch C/R/L format)
- **Port target:** `~/.claude/skills/ISA/` (vault: `_System/PAI/Skills/ISA/`). Drop in as-is.
- **Optional:** `ISASync` hook — PostToolUse hook that syncs ISA frontmatter to `work.json` for dashboard display. **Skip** (you don't have the dashboard).
- **Touch points after port:**
  - Update `Plans/` workflow: existing handoffs continue to work; new non-trivial plans use ISA Scaffold at the right tier.
  - Optional: add a thin shim in pai-harness so `bun bin/pai-harness.ts isa scaffold` calls the skill.
- **Effort:** ~2 hours (copy + skim + 1 real test run).

**2. ArXiv skill — 7 files, 429 lines, zero deps**
- Pure API client over arXiv Atom + AlphaXiv. No overlap with anything you have.
- **Port:** straight copy to `~/.claude/skills/ArXiv/`.
- **Effort:** 20 minutes.

**3. BitterPillEngineering skill — 6 files, 405 lines, standalone**
- Audits instruction sets ("would a smarter model make this rule unnecessary?") → classifies CUT/RESOLVE/MERGE/EVALUATE/SHARPEN/MOVE/KEEP. Reads `settings.json`.
- **High personal leverage:** Run it against your own CLAUDE.md and the global PAI instructions. You have a lot of rules; this is the audit tool for them.
- **Port:** straight copy. No collision with `CodeAudit` (code) or `RedTeam` (ideas) — this is orthogonal (instructions).
- **Effort:** 20 minutes copy + 1 hour running it on your actual instruction set.

### Tier B — Port with adaptation

**4. Migrate skill — 4 files, 336 lines**
- Ingests external content (Obsidian, Notion, Apple Notes, CLAUDE.md, .cursorrules), classifies into PAI taxonomy with confidence %, has approval workflows.
- **Partial overlap with `ResumeHandoff` and `ObsidianCLI`** but fills the **inbound** classification gap neither covers.
- Use case: when you onboard a new external knowledge dump (e.g., a coworker's Notion export, an old `.cursorrules` you want to absorb).
- **Effort:** 30 min copy + variable depending on first real ingestion.

### Tier C — Read but don't import

**5. Knowledge skill — 4 files, 571 lines**
- Typed knowledge archive (People/Companies/Ideas/Research) with cross-link enforcement and ripple-pass updates.
- **High collision with your `Vault` skill** (Karpathy 3-layer Obsidian setup at `Sunthings_AppStorage_EU_e2e`). Both curate knowledge; different entry vectors.
- **Don't import as a skill.** But: the **ripple-pass on ingest** (when adding a primary note, walk back-links and update related notes) is a pattern worth stealing for your Vault skill. Read SKILL.md, port the concept, not the skill.

**6. Optimize skill — 4 files, 336 lines**
- Autonomous hill-climb (metric mode: shell command → number; eval mode: LLM-as-judge).
- **Requires v5 Algorithm framework** (enters as `mode: optimize` with ISC integration). Your Algorithm is v4-shaped — would need adaptation.
- Significant overlap with `DevTeam` + `Science` + `Evals`. The novelty is full autonomy, but porting cost is high.
- **Defer.** Revisit if/when you want a generic "improve this thing until metric N" loop.

### Bonus: framing line for global CLAUDE.md

Add to `~/.claude/CLAUDE.md` under a new short section:

> **Infrastructure is the memory.** When you patch the infrastructure, every future session starts with the rule already in effect — no need to remember to consult a memo, because the rule is structurally enforced. Prefer hook/settings/skill changes over instruction-memo additions.

This captures what your hook system already does and discourages future instruction-bloat (which `BitterPillEngineering` would then catch and cut).

## Suggested execution order

1. **ArXiv** (20 min) — easiest win, ships the muscle memory of "yes we port from v5."
2. **ISA** (2 hr) — the real prize. Pick one in-flight `Plans/*.md` and re-author it as an ISA at the appropriate tier as the acceptance test.
3. **BitterPillEngineering** (20 min copy + 1 hr first audit) — point it at `~/.claude/CLAUDE.md` and the constitutional bits in `settings.json`. Expect it to want to cut a lot.
4. **Migrate** (30 min copy, defer first use) — installed and ready for when you hit a real ingestion need.
5. **Steal Knowledge's ripple-pass pattern** into your `Vault` skill (small edit, separate session).
6. **Framing line** added to CLAUDE.md (5 min).

**Total committed effort: ~4 hours of actual work, spread over however many sessions you want.**

## Verification per skill

- **ArXiv:** run a real query (e.g., "interpretability 2025") and confirm Atom parsing + AlphaXiv enrichment works.
- **ISA:** Scaffold an E3 ISA for a real task in `Plans/`, walk it through CheckCompleteness, confirm it scores as expected. Test the ID-stability rule by adding/removing an ISC and re-running CheckCompleteness.
- **BitterPillEngineering:** Run Audit against `~/.claude/CLAUDE.md`. Review CUT recommendations manually (don't auto-apply). Confirm token-savings estimate is plausible.
- **Migrate:** Dry-run against a sample `.md` file with mixed content (some TELOS-like, some Knowledge-like). Confirm classification confidence is reasonable.

No regressions expected — all four skills are additive. Worst case: a skill sits unused.

## What to NOT touch

- Pulse, Life Dashboard, ContainmentGuard, ShadowRelease, Interceptor, the full constitutional prompt, Memory v7.6 reshuffle. All previously rejected or evaluated as low-value-for-your-setup.

---

Plan is ready. Awaiting approval to exit plan mode and start executing in order (ArXiv → ISA → BPE → Migrate → ripple-pass → framing line).

---

## Round 4: v5 Algorithm primer + why Optimize is tangled in it

### What the v5 Algorithm actually is

Same 7 phases as v4 (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN), but the surrounding doctrine has been substantially formalized:

| Layer | v4 (yours) | v5 |
|---|---|---|
| Mode classification | `CapabilityRecommender` hook, NATIVE/ALGORITHM/MINIMAL | `ModeClassifier.hook.ts` on UserPromptSubmit, four modes: `NATIVE` / `ALGORITHM` / `MINIMAL` / `RESEARCH` |
| Mode selection logic | Heuristic | 5 deterministic NATIVE→ALGORITHM triggers + 3-axis fallback (Retrievability / Blast-Radius / Hard-to-Vary Depth) |
| Effort tiers | Implicit | Explicit E1–E5 with time bounds (<90s / <3m / <10m / <30m / <2h+) and soft ISC floors (E2≥16, E3≥32, E4≥128, E5≥256) |
| Tier → ISA gating | None | Each tier binds required ISA sections (E1: Goal+Criteria → E4/E5: all 12) |
| Thinking capabilities | Open-ended (assistant names them ad-hoc) | **Closed enumeration of 19**: IterativeDepth, ApertureOscillation, FeedbackMemoryConsult, Advisor, ReReadCheck, FirstPrinciples, SystemsThinking, RootCauseAnalysis, Council, RedTeam, Science, BeCreative, Ideate, BitterPillEngineering, Evals, WorldThreatModel, Fabric patterns, ContextSearch, ISA. Naming any other capability = **CRITICAL FAILURE** (phantom capability). List expansion requires editing `capabilities.md` + version bump. |
| Verification | Per-phase quality gates | **Three rules**: Rule 1 live-probe (every user-facing ISC needs a tool-verified probe: curl, screenshot, Read, SELECT, etc.); Rule 2 Advisor on commitment boundaries; Rule 2a Cato cross-vendor audit (GPT-5.4 via `codex exec --sandbox read-only`) mandatory at E4/E5 |
| Per-step durability | None | `CheckpointPerISC` hook persists state per ISC tick |

**The v6.0+ delta from v5.0:** v5.0 was a "BPE compaction" release that *removed* most quantitative floors (ISC counts, capability counts) — they got restored as soft minimums in v5.1–5.5 after regression. v6.0 closed the loop by re-floor-ing mode-selection via `EscalationGate.hook.ts` and elevating ISA to universal primitive (project-level ISAs at `<project>/ISA.md`).

**Bottom line on the Algorithm itself:** the doctrine is a strict supersetof what your `CapabilityRecommender` + `THEALGORITHM` skills already enforce. The novel bits worth knowing: (1) closed capability enumeration with hard rejection of phantoms, (2) Cato cross-vendor audit at high tiers, (3) ISA tier-gating. None of that requires importing the whole Algorithm — your v4 Algorithm is functionally close enough that the ISA port (Tier A item) carries 80% of the practical benefit.

### Why Optimize is tangled in v5 Algorithm specifically

`mode: optimize` is **not a separate skill mode** — it's a **phase variant of the Algorithm itself**. From `Packs/Optimize/src/SKILL.md`:

> "When `/optimize` is invoked, the Algorithm enters with `mode: optimize` in the ISA frontmatter. The eval_mode is set based on arguments: `--measure` → `eval_mode: metric` (git branch sandbox); `--target` → `eval_mode: eval` (directory sandbox). ISC criteria become **guard rails** — assertions that must hold true across ALL experiments. Guard rails must REMAIN satisfied perpetually. A violation triggers automatic revert regardless of score improvement."

Concretely, Optimize **replaces three Algorithm phases**:

- **BUILD → Phase 0 TARGET ANALYSIS** — auto-detects target type (skill/prompt/agent/code), generates eval criteria, establishes baseline measurement
- **EXECUTE → Optimize Loop** — autonomous hill-climb: HYPOTHESIZE → MODIFY → MEASURE → DECIDE (keep/revert) → repeat until termination
- **VERIFY → Phase 9 RECOMMEND** — diff summary with apply/reject/partial options

And it **reuses three Algorithm primitives**:
1. **ISCs as guard rails** — v5's ISC storage (ISA `## Criteria`, `progress: N/M`, `## Verification`) plus the *guard-rail-revert-on-violation* semantics, which don't exist in v4.
2. **Rule 1 live-probe** — every eval criterion must be a named tool probe.
3. **Rule 2 / 2a Advisor + Cato** — autonomous loops are dangerous (they mutate code/prompts unsupervised); the Advisor commitment-boundary call and Cato cross-vendor audit are the external governance that makes it acceptable.

**Could Optimize be ported standalone?** Technically yes. You'd have to rewrite: phase scaffolding (new 3-phase Analysis→Loop→Recommendation skeleton), ISC lifecycle file I/O, guard-rail revert decision tree, Advisor/Cato integration, Learning Router. That's basically reimplementing the v5 Algorithm in miniature inside the skill. **Architecturally flawed:** Optimize is an *autonomous agent* and autonomous agents inside hierarchical systems need the parent's governance structures — strip them and Optimize becomes a lower-confidence tool with no surface to escalate conflicts.

**Verdict (unchanged):** Defer Optimize. If you ever want autonomous hill-climbing, build it inside your existing `Science` skill loop (which already has hypothesis discipline) or `DevTeam` (which already has the engineer-reviewer pattern) — those are your v4-native ways to get 70% of Optimize's value without the v5 Algorithm dependency.

---

## Round 5: Satisfaction tracking layer (the "did this actually help?" loop)

Mirrors how `Evolve` (graduate learned patterns into skills) and `SiasReview` (weekly retrospective from learning signals) already work. Reuses existing infrastructure — no parallel system.

### Baseline (today, 2026-05-16) — captured BEFORE porting

For each of the four ported skills, record the baseline state in `~/.claude/MEMORY/STATE/v5-cherrypick-baseline.json`:

```json
{
  "experiment": "v5-cherry-pick",
  "started": "2026-05-16",
  "review_date": "2026-06-15",
  "skills_ported": ["ArXiv", "ISA", "BitterPillEngineering", "Migrate"],
  "pre_port_state": {
    "ArXiv": { "had_capability": false, "workaround": "ad-hoc web search" },
    "ISA": { "had_capability": "partial — Plans/*.md unstructured", "workaround": "free-form markdown handoffs" },
    "BitterPillEngineering": { "had_capability": false, "workaround": "manual prompt review during /Evolve" },
    "Migrate": { "had_capability": false, "workaround": "manual copy-paste from external sources" }
  },
  "predictions": {
    "ArXiv": "Used 1–3 times/month; low surprise.",
    "ISA": "Used on every non-trivial plan after week 2; HIGH leverage. Risk: ceremony exhaustion if E3+ template feels heavy for E2 tasks.",
    "BitterPillEngineering": "Used 1x to audit CLAUDE.md; recommendations applied selectively. May want re-run quarterly.",
    "Migrate": "Used 0 times in the 30 days unless a real ingestion need shows up."
  }
}
```

The `predictions` field is the critical bit — at review time, comparing prediction-vs-reality is the surprise signal. Calibration is the learning, not the raw usage count.

### Binary signals per skill (the things to check at 30-day review)

| Skill | Used at all? | Used >1x? | Caused a rating ≥7? | Caused a rating ≤3? | Predicted accurately? |
|---|---|---|---|---|---|
| ArXiv | ☐ | ☐ | ☐ | ☐ | ☐ |
| ISA | ☐ | ☐ | ☐ | ☐ | ☐ |
| BitterPillEngineering | ☐ | ☐ | ☐ | ☐ | ☐ |
| Migrate | ☐ | ☐ | ☐ | ☐ | ☐ |

Source of truth for rating signals: existing `~/.claude/MEMORY/LEARNING/ALGORITHM/` and `~/.claude/MEMORY/STATE/learning-index.json` — already auto-captured by `RatingCapture.hook.ts`.

Source of truth for usage: grep session logs at `~/.claude/projects/*/` and `~/.claude/state/` for invocations of each skill name.

### How the tracking gets wired (4 small steps, post-ExitPlanMode)

1. **Write the baseline JSON** to `~/.claude/MEMORY/STATE/v5-cherrypick-baseline.json` right after porting completes. The file IS the experiment.
2. **Schedule a durable cron** for **2026-06-15** that fires a prompt: *"Run the v5 cherry-pick retrospective. Read MEMORY/STATE/v5-cherrypick-baseline.json, then run SiasReview-style synthesis: for each ported skill, check binary signals, compute prediction-vs-reality delta, write findings to MEMORY/WISDOM/FRAMES/2026-06-15_v5_cherrypick_review.md."* Use `CronCreate` with `durable: true`.
3. **Tag every learning signal during the 30 days** that's triggered by a ported skill with `experiment: v5-cherry-pick` so the retrospective query is clean. This is a one-line addition to `RatingCapture.hook.ts` — only needed if signal volume is high enough to need filtering; otherwise grep by skill name at review time is fine.
4. **Add a marker in `~/.claude/CLAUDE.md` under "Active Experiments"** (create section if absent) so any session in the next 30 days knows the experiment is live. One line: `- v5 cherry-pick (ArXiv, ISA, BPE, Migrate) — review 2026-06-15. Baseline: MEMORY/STATE/v5-cherrypick-baseline.json.`

### Review-day deliverable (what 2026-06-15 produces)

A wisdom frame at `~/.claude/MEMORY/WISDOM/FRAMES/2026-06-15_v5_cherrypick_review.md` containing:
- Per-skill binary signal table (filled in)
- Prediction-vs-reality delta for each (the calibration signal)
- One paragraph: "Was the v5 cherry-pick worth it?"
- One paragraph: "What should we port next, port differently, or revert?"
- If any skill scored 0 usage AND 0 ratings: candidate for removal.
- If any skill caused ≥3 corrections (rating ≤3): candidate for adjustment or removal.
- Feeds the next `/Evolve` run as input ("graduate the survivors into permanent behavioral rules").

This is identical in shape to how `SiasReview` already operates on weekly cadence — just with a single fired prompt at the 30-day mark instead of recurring.

### Why this design

- **Reuses existing infra:** `RatingCapture` already captures signals; `learning-index.json` already indexes them; `MEMORY/WISDOM/FRAMES/` is already the destination for synthesized insights; `SiasReview` is the existing retrospective pattern; `CronCreate(durable)` survives session restarts. No new system.
- **Falsifiable predictions:** The `predictions` block in the baseline JSON forces calibration. Without it, the review is just usage counts.
- **One-shot, not recurring:** A single 30-day fire is enough. If we like the pattern, the next experiment gets its own one-shot.
- **Auto-graduates into `/Evolve`:** Surviving cherry-picks become candidates for permanent behavioral rules via your existing graduation path.

### Baseline contamination caveat (Cato catch 2026-05-16)

**Honesty correction:** Round 6 added Phase A (Algorithm consolidation + E1–E5 aliases) and a CLAUDE.md "Active Experiments" section, both shipping in the same window as the 4-skill port. That **contaminates the experiment baseline** — any satisfaction or rating shift over the next 30 days could be attributable to (a) the new skills, (b) Phase A, or (c) the CLAUDE.md change priming Sia's attention. The retrospective on 2026-06-15 must treat this as a confounded experiment, not a clean A/B test, and apply the following attribution discipline:

1. **Prefer per-skill usage counts** over aggregate satisfaction — they're directly attributable to a specific port.
2. **Discount aggregate satisfaction shifts** by ≥30% when interpreting them as cherry-pick value; some non-trivial fraction belongs to Phase A and the framing change.
3. **Look for skill-specific quotes** in learning signals (`"used ISA"`, `"BPE caught"`) rather than relying on coincidence-of-timing.
4. **Predict explicitly:** Phase A and CLAUDE.md changes are themselves small experiments — note any sessions where the E1–E5 aliases or the "Infrastructure Is the Memory" line caused a behavior shift, so the retrospective can separately credit/debit them.

This is not a reason to re-sequence the work — that ship has sailed — but the 2026-06-15 review must call out attribution uncertainty in its summary, not paper over it.

---

## Cato findings applied (2026-05-16)

This plan was audited by Cato (real cross-vendor pass: `codex exec --sandbox read-only` on gpt-5.5 via ChatGPT Max). Findings persisted to `~/.claude/MEMORY/VERIFICATION/cato-findings.jsonl`. Three actionable findings were corrected inline:

1. **Phase C bullet 7** — was "Cato-via-Gemini integration" (contradicting Round 6's decision to make codex primary). Corrected to "Cato-via-codex integration with Gemini-as-Cato as documented fallback."
2. **ContainmentGuard verdict** — was "vault symlink creates de facto containment, skip ContainmentGuard." Corrected to acknowledge symlinked vault *increases* damage radius and reclassified ContainmentGuard as worth porting in Phase C.
3. **Round 5 satisfaction layer** — added explicit baseline-contamination caveat with attribution discipline for the 2026-06-15 retrospective.

Two findings remain as permanent record (not corrected inline, intentionally retained for the retrospective):

- **"Straight copy, no regressions expected" optimism** — Cato is right that there's no sandboxed dry-run before live install. Leaving as a known limitation; the 30-day window will reveal any latent assumption-conflicts.
- **Inventory counts not pinned to a reproducible command** — true but cosmetic; the plan's hour estimates were close enough that re-inventory would not have changed the decision tree.

---

## Round 6: Weaving v5 Algorithm into the existing PAI framework

### Grounding the weave in your actual code

| File | What it currently is | Lines |
|---|---|---|
| `~/.claude/hooks/CapabilityRecommender.hook.ts` | UserPromptSubmit hook. Fast-path regex (~85%) → Haiku inference fallback. Outputs `FULL/ITERATION/MINIMAL` as a system-reminder with phase mandates. | 500 |
| `~/.claude/skills/Algorithm/SKILL.md` | Lite v4-style — Quick/Standard/Deep tiers, 4-50+ ISCs, delegates verification to `Workflows/*.md` | 79 |
| `~/.claude/skills/THEALGORITHM/SKILL.md` | Heavier — TRIVIAL/QUICK/STANDARD/THOROUGH/DETERMINED tiers, capability gating via `Data/Capabilities.yaml`, integrates Codex/Gemini/Grok at DETERMINED | 413 |
| Codex CLI | `/opt/homebrew/bin/codex` v0.130.0 installed. Auths via **ChatGPT account OAuth** (`codex login --device-auth`) — your ChatGPT Max subscription covers it; no API key needed. | — |
| Gemini | Wired via `GeminiResearcher` agent (Opus tier, called by `/Research`) | — |

**First-order finding:** `Algorithm` and `THEALGORITHM` are duplicated skills with different tier vocabularies. Consolidation is itself a v5-style cleanup (v5 has one canonical Algorithm). Recommend deprecating `Algorithm` (79-line lite) in favor of `THEALGORITHM` (413-line, capability-driven), then renaming `THEALGORITHM` → `Algorithm`. **Effort: 30 min cleanup.** Do this BEFORE weaving.

### Classification — what v5 has, what we have, what to weave

| v5 Algorithm component | Your v4 equivalent | Verdict | Cost |
|---|---|---|---|
| Mode classifier (Sonnet-backed, UserPromptSubmit) | `CapabilityRecommender` (Haiku + regex, UserPromptSubmit) | **Have it; upgrade lightly.** Switch Haiku → Sonnet for ambiguous cases; add `RESEARCH` as 4th mode. | 30 min |
| Effort tiers E1–E5 with time bounds | `THEALGORITHM` has TRIVIAL/QUICK/STANDARD/THOROUGH/DETERMINED | **Have it; align vocabulary.** Add E1–E5 as aliases (E1=TRIVIAL, E5=DETERMINED) so ISA's tier gating works. Don't rename — additive. | 20 min |
| Tier→ISA section binding (E1: Goal+Criteria → E4/E5: all 12) | None (no ISA yet) | **Wait for ISA port.** This binding ships *with* the ISA skill in the Tier-A cherry-pick. | 0 (deferred) |
| Closed capability list (19 names, phantom = CRITICAL FAILURE) | Open-ended; capabilities sourced dynamically from `Capabilities.yaml` | **Weave with Sia-tailored list.** See below. | 60 min |
| Rule 1: live-probe for user-facing ISCs (curl, screenshot, Read, SELECT) | Practiced informally; not codified as a rule | **Weave-cheap.** Add to `CLAUDE.md` "Behavioral Rules" section + reference in Algorithm skill VERIFY phase. | 15 min |
| Rule 2: Advisor on commitment boundaries | Have `DevTeam` engineer-reviewer pattern (used inconsistently) | **Weave-medium.** Formalize as "spawn Advisor agent before any irreversible action at STANDARD+ tier." Use existing `Architect` or `Engineer` as Advisor. | 30 min |
| Rule 2a: Cato cross-vendor audit (GPT-5.4 via codex) at E4/E5 | None | **Weave with real Cato (corrected).** Codex CLI supports ChatGPT-account OAuth — no API key needed. See Cato section below. | 45 min |
| `CheckpointPerISC` hook (per-ISC durability) | None | **Skip.** Low value for your workflow; you already commit frequently and use plan files. Adds complexity without clear win. | — |
| `EscalationGate.hook.ts` (mode floor enforcement) | Implicit in CapabilityRecommender's regex floor | **Skip.** Your existing floors are good enough. | — |

**Total weave cost: ~3 hours of edits** (cleanup + 5 weaves). Less than half the ~4 hours of cherry-pick porting.

### Sia-tailored closed capability list (not a verbatim v5 copy)

v5's 19-capability list assumes their skill roster. You have 73 skills. Many are domain/workflow (Telos, USMetrics, OneMessage) not "thinking capabilities." The **thinking-capability subset** to enumerate as closed:

```yaml
# ~/.claude/skills/Algorithm/Data/ThinkingCapabilities.yaml
# Closed enumeration. Naming a capability not in this list = CRITICAL FAILURE.
# Expansion requires editing this file + version bump.
version: 1.0.0
capabilities:
  # Analytical
  - FirstPrinciples       # decompose to fundamentals
  - SystemsThinking       # iceberg, causal loops, archetypes (port from v5)
  - RootCauseAnalysis     # 5 Whys, Fishbone, fault tree (port from v5)
  - IterativeDepth        # multi-angle iterative exploration
  - ApertureOscillation   # narrow→wide→synthesis (port from v5)
  - BitterPillEngineering # over-prompting audit (Tier-A port)
  # Generative
  - BeCreative            # extended thinking, divergent ideas
  - Ideate                # 9-phase evolutionary ideation (consider porting)
  - Council               # multi-perspective debate
  # Adversarial
  - RedTeam               # 32 agents adversarial
  - WorldThreatModelHarness  # 11 time horizons (yours, not v5's variant)
  - PromptInjection       # LLM security testing
  # Empirical
  - Science               # hypothesis-test-analyze cycles
  - Evals                 # benchmarks, regression tests
  - CodeAudit             # bug/dead-code/DRY hunting
  # Verification / Audit
  - Advisor               # commitment-boundary review (new doctrine, uses Architect/Engineer agent)
  - Cato                  # cross-vendor audit (new doctrine, uses Gemini-as-Cato)
  - CompletionGate        # pre-done behavioral gate
  # Knowledge
  - Research              # multi-agent parallel research
  - ContextSearch         # cold-start context recovery (consider porting)
  - Fabric                # 242+ specialized patterns
  - ExtractWisdom         # adaptive content analysis
  # Structuring
  - ISA                   # 12-section structured PRD (Tier-A port)
```

**That's 23 thinking capabilities** — broader than v5's 19, but everything is a real skill you already have (or will after Tier-A ports). `CapabilityRecommender` enforces: if Sia names a capability NOT in this list during PLAN phase, the hook rejects with "phantom capability" and forces re-selection.

**Expansion rule:** adding a capability requires editing `ThinkingCapabilities.yaml` AND bumping `version`. No ad-hoc invention at runtime. This is the rule that prevents under-pressure vocabulary drift.

### Cato — real codex via ChatGPT account (corrected)

**Earlier draft of this section was wrong.** I assumed `OPENAI_API_KEY UNSET` blocked Cato. It doesn't. Verified directly from `codex login --help` and OpenAI's official docs:

- `codex login` defaults to **device-auth OAuth** (browser flow) — `--with-api-key` is one option among several, not the default
- OpenAI docs verbatim: *"Authenticate with your ChatGPT account or an API key."*
- Plans that include codex: *"ChatGPT Plus, Pro, Business, Edu, and Enterprise plans include Codex."*
- You have **ChatGPT Max** (≈ Pro tier or higher at $200/mo). Codex is bundled — **no extra spend required.**

**One-time setup (post-ExitPlanMode):**
```bash
codex login              # opens browser → sign in to ChatGPT → device auth
codex login status       # verify
codex exec --sandbox read-only "echo hi"   # smoke test
```

**Integration mechanism — primary path (real Cato):**

```typescript
// Lives as prose in Algorithm skill VERIFY phase, not as code
async function runCatoAudit(isaPath: string, advisorVerdict: string) {
  const prompt = `Cross-vendor audit. Read the ISA at ${isaPath} and the Advisor verdict.
                  Return JSON: { status: "pass"|"concerns"|"fail",
                                 findings: [{severity, claim, evidence}] }.
                  You are intentionally a different vendor than the executor —
                  surface blind spots an Anthropic model would share.
                  Advisor verdict:\n${advisorVerdict}`;

  // Real Cato via codex CLI (ChatGPT-auth)
  const result = await Bash(`codex exec --sandbox read-only --json -- "${prompt}"`);
  appendToFile("~/.claude/MEMORY/VERIFICATION/cato-findings.jsonl", result);
  return result;
}
```

**Fallback path (if codex auth fails or rate-limited):** swap the `Bash(codex exec ...)` line for `Agent({subagent_type: "GeminiResearcher", ...})`. Same JSON contract. Gemini-as-Cato becomes the **fallback**, not the primary. Both stay implemented so a codex outage doesn't block E4/E5 work.

**Why real Cato beats Gemini-as-Cato as primary:**
- Sandboxed read-only execution as v5 designed (codex sandbox isolates from your filesystem during audit)
- Different model family (GPT-5/GPT-5.1) with genuinely different training corpus and RLHF than Gemini, sharper for catching Anthropic-shared blind spots
- Lower marginal cost per audit (bundled in Max) than Gemini (Vertex AI API charges per call)

### Cost and rate-limit guidance for Cato use

ChatGPT Pro/Max plans don't publish hard codex CLI quotas, but anecdotal limits are generous for typical IDE use. To avoid surprise throttling under PAI workload (which can spawn many E4/E5 audits in a day):

**Throttling rules (encode in Algorithm skill):**
1. **Cato fires only at E4 and E5** (DETERMINED tier in your existing vocabulary). Never at E1/E2/E3. v5 doctrine matches this — Cato is gated to high-stakes only.
2. **Cooldown:** if an E4/E5 task fires Cato, suppress the next Cato call for 5 minutes regardless of tier. Prevents tight loops from burning quota.
3. **Daily cap:** max 20 Cato calls per 24h. If exceeded, fall back to Gemini-as-Cato for the rest of the day.
4. **Manual override:** `--no-cato` flag on Algorithm invocation skips Cato entirely (for offline or quota-constrained sessions).
5. **Findings persist:** `MEMORY/VERIFICATION/cato-findings.jsonl` keeps history so review-day retrospectives can see Cato's actual call volume and hit rate.

Implementation: simple state file at `~/.claude/state/cato-quota.json` (`{ "last_call_ts": ..., "calls_today": N, "day_start": ... }`) checked at the top of the audit function. Plain bun, no external rate-limit library.

### Sequencing decision

Three sequencing options considered:

| Option | Pro | Con |
|---|---|---|
| Weave ALL before cherry-pick port | ISA port benefits from E1–E5 tier system being live | Contaminates cherry-pick baseline; satisfaction shifts confounded with Algorithm changes |
| Weave NONE until after 30-day review | Clean experiment baseline | ISA port lacks E1–E5 binding; full ISA value not realized in the 30 days |
| **Split: minimal weave before, deep weave after** | ISA gets what it needs; major doctrine changes wait for data | Two-phase execution |

**Recommended: SPLIT.**

**Phase A — minimal weave (before cherry-pick port, ~50 min):**
1. Consolidate `Algorithm` + `THEALGORITHM` → single `Algorithm` skill (30 min)
2. Add E1–E5 aliases to existing tier vocabulary (20 min)

**Phase B — cherry-pick port** (the 4-skill port from Round 3, ~4 hours)

**Phase C — deep weave (after 30-day review at 2026-06-15, ~2.5 hours):**
3. Closed capability list + phantom rejection in CapabilityRecommender (60 min)
4. Sonnet upgrade + `RESEARCH` mode in CapabilityRecommender (30 min)
5. Rule 1 live-probe codification in CLAUDE.md + Algorithm skill (15 min)
6. Rule 2 Advisor formalization (30 min)
7. Rule 2a Cato-via-codex integration (45 min, with Gemini-as-Cato wired as documented fallback)

**Rationale:** Phase A unblocks ISA. Phase C waits for the cherry-pick experiment data so we know if (a) the cherry-picks succeeded and (b) which weaves the data actually justifies. If the 30-day review shows ISA underused, we'd skip the closed capability list (less value without ISA adoption). If it shows BPE caught lots of over-prompting in CLAUDE.md, the live-probe rule becomes higher priority.

### Tracking the weave (extend the satisfaction layer)

Add a second baseline JSON at Phase A start: `~/.claude/MEMORY/STATE/v5-algorithm-weave-baseline.json` with predictions per weave step. Single 60-day cron (2026-07-15) fires the deep-weave retrospective — separate from the 30-day cherry-pick review so signals don't contaminate each other.

### What we explicitly do NOT weave

- **`CheckpointPerISC` hook** — adds per-ISC durability; your existing commit cadence + plan files cover this.
- **`EscalationGate.hook.ts`** — your existing mode floors are good enough.
- **Wholesale v5 doctrine text** — keep your existing Algorithm voice/format; weave behaviors, not prose.
- **Phantom-rejection on EVERY hook fire** — only enforce during ALGORITHM-mode PLAN phase, not on MINIMAL or ITERATION. Avoids over-policing.

---

## Updated total picture

| Bundle | Order | Effort | Review checkpoint |
|---|---|---|---|
| **Phase A: Algorithm consolidation + E1–E5 aliases** | 1st | 50 min | Inline (just runs) |
| **Phase B: 4-skill cherry-pick port** (ArXiv, ISA, BPE, Migrate) | 2nd | 4 hr | 2026-06-15 (30-day) |
| **Phase C: Deep Algorithm weave** (closed list, Sonnet upgrade, Rules 1/2/2a) | 3rd, after Phase B review | 2.5 hr | 2026-07-15 (60-day) |

**Total committed effort: ~7.5 hours across ~2 months, two review checkpoints.** Compares favorably to the 2-3 day full v5 in-place upgrade with high regression risk.
