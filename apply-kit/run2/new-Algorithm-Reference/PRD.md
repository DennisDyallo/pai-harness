---
name: Algorithm Reference — PRD Integration
description: PRD lifecycle, template, frontmatter, per-phase behavior, multi-iteration, loop/worker execution modes, agent teams, and sync rules. On-demand depth for the PAI Algorithm.
---

# PRD Integration (Persistent State) — Reference

> Relocated from PAI/SKILL.md during the v5 context de-bloat. The behavioral rules in PAI/SKILL.md remain authoritative and always-on. This is the on-demand reference detail for persistent PRD state and dispatch mechanics.

## PRD Status Progression (v1.0.0)

PRD status tracks Algorithm lifecycle:

```
DRAFT → CRITERIA_DEFINED → PLANNED → IN_PROGRESS → VERIFYING → COMPLETE
                                                                → FAILED (max iterations reached)
                                                                → BLOCKED (all remaining criteria are Custom/interactive)
```

| Status | When Set | Meaning |
|--------|----------|---------|
| `DRAFT` | PRD created | Initial creation, no criteria yet |
| `CRITERIA_DEFINED` | After OBSERVE | ISC created and Quality Gate passed |
| `PLANNED` | After PLAN | Execution plan written, verification strategy set |
| `IN_PROGRESS` | After BUILD starts | Active work underway |
| `VERIFYING` | During VERIFY | Systematic verification in progress |
| `COMPLETE` | All ISC pass | All non-Custom criteria verified passing |
| `FAILED` | Max iterations | Loop mode exhausted iterations without completion |
| `BLOCKED` | Custom-only remaining | All remaining criteria need human judgment — loop mode cannot proceed |

The `BLOCKED` status is critical for loop mode — it prevents infinite loops on un-automatable criteria.

## Dual-Tracking: Working Memory + Persistent Memory

Ideal State Criteria live in TWO systems simultaneously:

| Track | System | Lifetime | Purpose |
|-------|--------|----------|---------|
| **Working Memory** | TaskCreate/TaskList/TaskUpdate | Dies with session | Real-time verification in THIS session |
| **Persistent Memory** | PRD file IDEAL STATE CRITERIA section | Permanent | Survives sessions, readable by any agent |

Both tracks must stay in sync. TaskCreate is the write-ahead log. PRD is the handoff contract.

## PRD Template (v1.0.0)

Every Algorithm run creates at least this:

```markdown
---
prd: true
id: PRD-{YYYYMMDD}-{slug}
status: DRAFT
mode: interactive
effort_level: Standard
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
iteration: 0
maxIterations: 128
loopStatus: null
last_phase: null
failing_criteria: []
verification_summary: "0/0"
parent: null
children: []
---

# {Task Title}

> {One sentence: what this achieves and why it matters.}

## STATUS

| What | State |
|------|-------|
| Progress | 0/{N} criteria passing |
| Phase | {current Algorithm phase} |
| Next action | {what happens next} |
| Blocked by | {nothing, or specific blockers} |

## CONTEXT

### Problem Space
{What problem is being solved and why it matters. 2-3 sentences max.}

### Key Files
{Files that a fresh agent must read to resume. Paths + 1-line role description each.}

### Constraints
{Hard constraints: backwards compatibility, performance budgets, API contracts, dependencies.}

### Decisions Made
{Technical decisions from previous iterations that must be preserved. Moved from DECISIONS section on completion.}

## PLAN

{Execution approach, technical decisions, task breakdown.
Written during PLAN phase. MANDATORY — no PRD is valid without a plan.
For Extended+ effort level: written in plan mode for structured codebase exploration.}

## IDEAL STATE CRITERIA (Verification Criteria)

{Criteria format: ISC-{Domain}-{N} for grouped (17+), ISC-C{N} for flat (<=16)}
{Each criterion: 8-12 words, state not action, binary testable}
{Each carries inline verification method via | Verify: suffix}
{Anti-criteria prefixed ISC-A-}

### {Domain} (for grouped PRDs, 17+ criteria)

- [ ] ISC-C1: {8-12 word state criterion} | Verify: {CLI|Test|Static|Browser|Grep|Read|Custom}: {method}
- [ ] ISC-C2: {8-12 word state criterion} | Verify: {type}: {method}
- [ ] ISC-A1: {8-12 word anti-criterion} | Verify: {type}: {method}

## DECISIONS

{Non-obvious technical decisions made during BUILD/EXECUTE.
Each entry: date, decision, rationale, alternatives considered.}

## LOG

### Iteration {N} — {YYYY-MM-DD}
- Phase reached: {OBSERVE|THINK|PLAN|BUILD|EXECUTE|VERIFY|LEARN}
- Criteria progress: {passing}/{total}
- Work done: {summary}
- Failing: {list of still-failing criteria IDs}
- Context for next iteration: {what the next agent needs to know}
```

**PRD Frontmatter Fields (v1.0.0):**

| Field | Type | Purpose |
|-------|------|---------|
| `prd` | boolean | Always `true` — identifies file as PRD |
| `id` | string | Unique identifier: `PRD-{YYYYMMDD}-{slug}` |
| `status` | string | Lifecycle status (see Status Progression above) |
| `mode` | string | `interactive` (human in loop) or `loop` (autonomous) |
| `effort_level` | string | Effort level for this task (or per-iteration effort level for loop mode) |
| `created` | date | Creation date |
| `updated` | date | Last modification date |
| `iteration` | number | Current iteration count (0 = not started) |
| `maxIterations` | number | Loop ceiling (default 128) |
| `loopStatus` | string\|null | `null`, `running`, `paused`, `stopped`, `completed`, `failed` |
| `last_phase` | string\|null | Which Algorithm phase the last iteration reached |
| `failing_criteria` | array | IDs of currently failing criteria for quick resume |
| `verification_summary` | string | Quick parseable progress: `"N/M"` |
| `parent` | string\|null | Parent PRD ID if this is a child PRD |
| `children` | array | Child PRD IDs if decomposed |

**Location:** Project `.prd/` directory if inside a project with `.git/`, else `~/.claude/MEMORY/WORK/{session-slug}/`
**Slug:** Task description lowercased, special chars stripped, spaces to hyphens, max 40 chars.

## Per-Phase PRD Behavior

**OBSERVE:**
- New work: Create PRD after Ideal State Criteria creation. Write criteria to ISC section.
- Continuing work: Read existing PRD. Rebuild TaskCreate from ISC section. Resume.
- Referencing prior work: CONTEXT RECOVERY finds relevant PRD/session. Load context, then create ISC informed by prior work. If PRD found, treat as "Continuing work" path.
- Sync invariant: TaskList and PRD ISC section must show same state.
- Write initial CONTEXT section with problem space and architectural context.

**THINK:**
- Add/modify criteria → update BOTH TaskCreate AND PRD ISC section.
- If 10+ criteria: note iteration estimate in STATUS.
- Assign inline verification methods to each criterion (`| Verify:` suffix).

**PLAN (MANDATORY PRD PLAN):**
- For Extended+ effort level: enter plan mode for structured ISC development (see PLAN phase above).
- Write approach to PRD PLAN section. Every PRD requires a plan — this is not optional.
- PLAN section must contain: execution approach, key technical decisions, and task breakdown.
- If decomposing → create child PRDs, link in parent frontmatter.
- Child naming: `PRD-{date}-{parent-slug}--{child-slug}.md`
- Update PRD status to `PLANNED`.

**BUILD:**
- Non-obvious decisions → append to PRD DECISIONS section.
- New requirements discovered → TaskCreate + PRD ISC section append.
- Update PRD status to `IN_PROGRESS`.
- Update CONTEXT section with new architectural knowledge.

**EXECUTE:**
- Edge cases discovered → TaskCreate + PRD ISC section append.
- Update CONTEXT section with execution discoveries.

**VERIFY:**
- TaskUpdate each criterion with evidence.
- Mirror to PRD: `- [ ]` → `- [x]` for passing criteria.
- Update PRD STATUS progress count and `verification_summary` frontmatter.
- Update `failing_criteria` frontmatter with IDs of still-failing criteria.
- Update `last_phase` frontmatter to `VERIFY`.
- If all pass: set PRD status to `COMPLETE`.

**LEARN:**
- Append LOG entry: date, work done, criteria passed/failed, context for next session.
- Update PRD STATUS with final state.
- If complete: set PRD frontmatter status to `COMPLETE`.
- Write ALGORITHM REFLECTION to JSONL (Standard+ effort level only).

## Multi-Iteration (built-in, no special machinery)

The PRD IS the iteration mechanism:
1. Session ends with failing criteria → PRD saved with LOG entry and context.
2. Next session reads PRD → rebuilds working memory → continues on failing criteria.
3. Repeat until all criteria pass → PRD marked COMPLETE.

The algorithm CLI reads PRD status and re-invokes:
```bash
bun algorithm.ts -m loop -p PRD-{id}.md -n 128
```

**Loop Mode Effort Level Decay (v1.0.0):**
Loop iterations start at the PRD's `effort_level` but decay toward Fast as criteria converge:
- Iterations 1-3: Use original effort level tier (full exploration)
- Iterations 4+: If >50% criteria passing, drop to Standard (focused fixes)
- Iterations 8+: If >80% criteria passing, drop to Fast (surgical only)
- Any iteration: If new failing criteria discovered, reset to original effort level tier

This prevents late iterations from burning Extended budgets on single-criterion fixes.

## Execution Modes (v1.1.0)

The Algorithm operates in two distinct execution modes. The mode is determined by context, not by the user.

### Interactive Mode (Default)

The full 7-phase Algorithm as documented above. Used when:
- A human is in the conversation loop
- New work requiring ISC creation
- Single-session tasks

Interactive mode runs all phases (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN), creates ISC via TaskCreate, performs capability audits, and produces formatted output. (Voice curls are DISABLED globally — the per-phase announcement curls are commented out and do not execute.)

### Loop Worker Mode (Parallel Agents)

A focused executor mode used by `algorithm.ts -m loop -a N` when N > 1. Each worker agent receives exactly ONE ISC criterion and operates as a surgical fix agent — not a full Algorithm runner.

**Worker Behavior:**
- Receives: one criterion ID, the PRD path, and the PRD's CONTEXT section
- Reads: PRD for problem context and key files
- Does: the minimum work to make that single criterion pass
- Verifies: runs the criterion's inline verification method
- Updates: checks off its criterion in the PRD (`- [ ]` → `- [x]`) if passing
- Exits: immediately after completing its one criterion

**What Workers Do NOT Do:**
- No Algorithm format output (no phase headers, no `━━━` separators)
- No ISC creation (TaskCreate) — criteria already exist in the PRD
- No voice curls (curl to localhost:8888) — only the parent orchestrator announces
- No PRD frontmatter updates — parent reconciles after all workers complete
- No capability audits, no reverse engineering, no effort level assessment
- No touching other criteria — strictly single-criterion scope

**Orchestrator (Parent Process):**
The `algorithm.ts` CLI IS the Algorithm at the macro level:
1. Reads PRD → identifies failing criteria (OBSERVE equivalent)
2. Partitions: one criterion per agent, up to N agents (PLAN equivalent)
3. Spawns N `claude -p` workers in parallel via `Bun.spawn` + `Promise.all` (EXECUTE equivalent)
4. Waits for all workers → re-reads PRD → reconciles frontmatter (VERIFY equivalent)
5. Loops until all criteria pass or max iterations reached (LEARN equivalent)

**Worker-Stealing Pool:**
Each iteration, the orchestrator:
1. Counts failing criteria
2. Spawns `min(agentCount, failingCount)` workers
3. Each gets the next unresolved criterion
4. After all complete, re-evaluate and repeat

**CLI Invocation:**
```bash
# Sequential (1 agent — identical to current behavior):
bun algorithm.ts -m loop -p PRD-file.md -n 20

# Parallel (8 agents — each gets 1 criterion):
bun algorithm.ts -m loop -p PRD-file.md -n 20 -a 8
```

**Dashboard Integration:**
- `mode` field in AlgorithmState set to `"loop"` (not shown as effort level)
- `parallelAgents` field shows configured agent count
- `agents[]` array shows per-agent status, criterion assignment, and phase
- Effort level hidden when `mode === "loop"` (varies per iteration via decay)

## Agent Teams / Swarm + PRD

**Terminology:** "Agent team", "swarm", and "agent swarm" all refer to the same capability — coordinated multi-agent execution with shared task lists.

**Invocation (CRITICAL):** To spawn an agent team, you MUST say the words **"create an agent team"** in your output — this is the trigger phrase that activates team creation. Without this phrase, teams will NOT spawn regardless of what tools you call. After triggering, use `TeamCreate` to set up the team and `SendMessage` to coordinate teammates. Requires env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

**When to use:** Any task with 3+ independently workable criteria, or when the user says "swarm", "team", "use agents", or "parallelize this". Default to teams for Extended/Advanced/Deep/Comprehensive effort level tasks with complex ISC.

When decomposing into child PRDs:
1. Lead creates child PRDs with criteria subsets.
2. Lead spawns workers via Task tool with `team_name` parameter, each given their child PRD path.
3. Workers follow Algorithm phases against their child PRD.
4. Lead reads child PRDs to track aggregate progress.
5. When all children complete → update parent PRD.

## Sync Rules

| Event | Working Memory | Disk |
|-------|---------------|------|
| New criterion | TaskCreate | Append `- [ ] ISC-C{N}: ... \| Verify: ...` to PRD ISC section |
| Criterion passes | TaskUpdate(completed) | `- [ ]` → `- [x]` in PRD ISC section |
| Criterion removed | TaskUpdate(deleted) | Remove from PRD ISC section |
| Criterion modified | TaskUpdate(description) | Edit in PRD ISC section |
| Session starts (existing PRD) | Rebuild TaskCreate from PRD | Read PRD |
| Session ends | Dies with session | PRD survives on disk |

Conflict resolution: If working memory and disk disagree, PRD on disk wins.
