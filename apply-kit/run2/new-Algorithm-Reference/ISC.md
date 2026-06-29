---
name: Algorithm Reference — Ideal State Criteria
description: ISC requirements, scale tiers, and the standalone Quality Gate reference. On-demand depth for the PAI Algorithm's OBSERVE/THINK phases.
---

# Ideal State Criteria — Requirements & Quality Gate (Reference)

> Relocated from PAI/SKILL.md during the v5 context de-bloat. The behavioral rules in PAI/SKILL.md (output format, phase discipline) remain authoritative and always-on. This file is the on-demand reference detail.

## Ideal State Criteria Requirements

| Requirement | Rule | Example |
|-------------|------|---------|
| **8-12 words** | Each criterion is 8-12 words. Not fewer. Not more. | "User session persists correctly across browser tab refreshes" (9 words) |
| **State, not action** | Describe the CONDITION that must be true, not the work to do | "Tests pass" NOT "Run tests" |
| **Binary testable** | Must be answerable YES or NO in under 5 seconds with evidence | "JWT middleware rejects expired tokens with 401 status" |
| **Granular** | One concern per criterion. If it has "and", split it. | "Login returns JWT" and "Login returns refresh token" as SEPARATE criteria |
| **Minimum 4 criteria** | Every task, no matter how simple, has at least 4 criteria | Even "fix a typo" has: file changed, typo gone, no new typos introduced, build passes |
| **Scale with complexity** | Match ISC count to project scope. See scale tiers below. | "Fix typo" = 4 criteria. "Build auth system" = 40+. "Redesign platform" = 150+. |
| **Inline verification** | Each criterion carries its verification method | `ISC-C1: Session persists across tab refreshes \| Verify: Browser: open, close, reopen tab` |

**ISC Scale Tiers:**

| Tier | ISC Count | Structure | When |
|------|-----------|-----------|------|
| **Simple** | 4-16 | Flat list | Single-file fix, skill invocation, config change |
| **Medium** | 17-32 | Grouped by domain (### headers) | Multi-file feature, API endpoint, component build |
| **Large** | 33-99 | Grouped domains + child PRDs | Multi-system feature, major refactor, 16-action plan |
| **Massive** | 100-500+ | Multi-level hierarchy, team decomposition | Platform redesign, full product build, system migration |

**Structure rules:** ≤16 criteria = flat list. 17-32 = group under `### Domain` headers. 33+ = decompose into child PRDs (one per domain). 100+ = multi-level hierarchy with agent teams.

**Anti-criteria** capture what must NOT happen. Same 8-12 word rule:
- Prefix with `ISC-A` instead of `ISC-C`: `ISC-A1: No credentials exposed in repository commit history` (8 words)
- Minimum 1 anti-criterion per task. Most tasks have 2-4.

**Tools:**
- `TaskCreate` - Create criterion (prefix subject with "ISC-")
- `TaskUpdate` - Modify, mark completed with evidence, or mark failed
- `TaskList` - Display all criteria (ALWAYS use this, never manual tables)
- PRD IDEAL STATE CRITERIA section - Persist criteria to disk (see PRD Integration reference)

---

## Ideal State Criteria Quality Gate

After OBSERVE creates Ideal State Criteria via TaskCreate, the Quality Gate self-check fires before proceeding to THINK.

### The Gate (5 checks mandatory, 2 Extended+ only)

| # | Check | Pass condition | Fail action |
|---|-------|---------------|-------------|
| QG1 | **Count + Structure** | >= 4 criteria exist AND scale-appropriate for tier. If >16: grouped by domain. If >32: child PRDs. | Add more. Group if flat at scale. Spawn Algorithm Agent if stuck. |
| QG2 | **Word count** | Every criterion is 8-12 words | Rewrite via TaskUpdate. |
| QG3 | **State not action** | No criterion starts with a verb (build, create, run, implement, add, fix, write) | Rewrite as state. |
| QG4 | **Binary testable** | For each criterion, you can articulate the YES evidence in one sentence | Decompose vague criteria. |
| QG5 | **Anti-criteria exist** | >= 1 anti-criterion (what must NOT happen) | Add at least one. |
| QG6 | **Coverage (Extended+ only)** | Every extracted constraint [EX-N] maps to ≥1 ISC criterion (Constraint→ISC Coverage Map has zero gaps) | Create ISC for unmapped constraints. Skip at Standard and below. |
| QG7 | **Specificity (Extended+ only)** | No ISC criterion abstracts a specific number, threshold, or quantitative bound from the source into a vague qualifier ("reasonable", "appropriate", "overwhelming", "properly") | Rewrite criterion to preserve the specific value from the source. Skip at Standard and below. |

If BLOCKED: fix issues, re-run gate. Do not enter THINK with a blocked gate.

### Ideal State Criteria Decomposition Decision (part of CAPABILITY AUDIT)

| Signal | Structure | Agent Strategy |
|--------|-----------|---------------|
| Simple task (4-8 criteria) | Flat list, single PRD | Single agent, no decomposition needed |
| Medium task (12-40 criteria) | Grouped by domain headers | Spawn Algorithm Agents for parallel domain discovery |
| Large task (40-150 criteria) | Grouped + child PRDs per domain | Spawn Architect Agent to map domains, Algorithm Agents per child PRD |
| Massive task (150-500+ criteria) | Multi-level hierarchy, agent teams | Agent team: Architect maps structure, Engineers per domain, Red Team for anti-criteria |
| Unfamiliar domain | Any tier | Spawn Researcher Agent to discover requirements and edge cases |
| Security/safety implications | Any tier | Spawn RedTeam Agent to generate anti-criteria (failure modes) |
| Ambiguous request | Any tier | Use AskUserQuestion before generating criteria |

**Decomposition triggers** (split any criterion containing): conjunction "and" joining two conditions, compound verbs ("creates and validates"), vague qualifiers ("properly", "correctly"), or >12 words.
