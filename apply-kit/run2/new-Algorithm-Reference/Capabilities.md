---
name: Algorithm Reference — Capabilities Selection
description: The full 25-capability registry, ISC-first combination guidance, the effort-scaled Capability Audit format, agent invocation mechanics, and background agent rules. On-demand depth.
---

# CAPABILITIES SELECTION (Reference)

> Relocated from PAI/SKILL.md during the v5 context de-bloat. The behavioral rules in PAI/SKILL.md (no-agents-for-instant-ops, phase discipline) remain authoritative and always-on. This is the on-demand capability registry and audit-format reference.

## CAPABILITIES SELECTION (v1.1.0 — Full Scan)

### Core Principle: Always check for and execute capabilities, scaled by effort level

Every task gets a FULL SCAN of all capability categories. The effort level determines what you INVOKE, not what you EVALUATE. Even at Instant effort level, you must prove you considered everything. Defaulting to DIRECT without a full scan is a **CRITICAL FAILURE MODE**.

### The Power Is in Combination

**Capabilities exist to improve Ideal State Criteria — not just to execute work.** The most common failure mode is treating capabilities as independent tools. The real power emerges from COMBINING capabilities across sections:

- **Thinking + Agents:** Use IterativeDepth to surface ISC criteria, then spawn Algorithm Agents to pressure-test them
- **Agents + Collaboration:** Have Researcher Agents gather context, then Council to debate the implications for ISC
- **Thinking + Execution:** Use First Principles to decompose, then Parallelization to build in parallel
- **Collaboration + Verification:** Red Team the ISC criteria, then Browser to verify the implementation

**Two purposes for every capability:**
1. **ISC Improvement** — Does this capability help me build BETTER criteria? (Primary)
2. **Execution** — Does this capability help me DO the work faster/better? (Secondary)

Always ask: "What combination of capabilities would produce the best possible Ideal State Criteria for this task?"

### The Full Capability Registry

Every capability audit evaluates ALL 25. No exceptions. Capabilities are organized by function — select one or more from each relevant section, then combine across sections.

**SECTION A: Foundation (Infrastructure — always available)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 1 | **Task Tool** | Ideal State Criteria creation, tracking, verification | TaskCreate, TaskUpdate, TaskList |
| 2 | **AskUserQuestion** | Resolve ambiguity before building wrong thing | Built-in tool |
| 3 | **Claude Code SDK** | Isolated execution via `claude -p` | Bash: `claude -p "prompt"` |
| 4 | **Skills** (70+ — ACTIVE SCAN) | Domain-specific sub-algorithms — MUST scan index per task | Read `skill-index.json`, match triggers against task |

**SECTION B: Thinking & Analysis (Deepen understanding, improve ISC)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 5 | **Iterative Depth** | Multi-angle exploration: 2-8 lenses on the same problem | IterativeDepth skill |
| 6 | **First Principles** | Fundamental decomposition to root causes | FirstPrinciples skill |
| 7 | **Be Creative** | Extended thinking, divergent ideation | BeCreative skill |
| 8 | **Plan Mode** | Structured ISC development and PRD writing (Extended+ effort level) | EnterPlanMode tool |
| 9 | **World Threat Model Harness** | Test ideas against 11 time-horizon world models (6mo→50yr) | WorldThreatModelHarness skill |

**SECTION C: Agents (Specialized workers — scale beyond single-agent limits)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 10 | **Algorithm Agents** | Ideal State Criteria-specialized subagents | Task: `subagent_type=Algorithm` |
| 11 | **Engineer Agents** | Build and implement | Task: `subagent_type=Engineer` |
| 12 | **Architect Agents** | Design, structure, system thinking | Task: `subagent_type=Architect` |
| 13 | **Research Skill** (MANDATORY for research) | Multi-model parallel research with effort-level-matched depth. **ALL research MUST go through the Research skill** — never spawn ad-hoc agents for research. Effort level mapping: Fast → quick single-query, Standard → focused 2-3 queries, Extended/Advanced → thorough multi-model parallel, Deep/Comprehensive → comprehensive multi-angle with synthesis | Research skill (invoke with depth matching current Algorithm effort level) |
| 14 | **Custom Agents** | Full-identity agents with unique name, voice, color, backstory. Built-in agents live in `agents/*.md` with persona frontmatter. Custom agents created via ComposeAgent and saved to `~/.claude/custom-agents/`. **Invocation pattern:** (1) Read agent file to get prompt + voice_settings, (2) Launch with `Task(subagent_type="general-purpose", prompt=agentPrompt)`, (3) Agent curls voice server with `voice_settings` for pass-through. **Anti-pattern:** NEVER use built-in agent type names (Engineer, Architect, etc.) as `subagent_type` for custom agents — always use `general-purpose`. | Agents skill: `bun ComposeAgent.ts --task "..." --save`, `subagent_type=general-purpose` |

**SECTION D: Collaboration & Challenge (Multiple perspectives, adversarial pressure)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 15 | **Council** | Multi-agent structured debate | Council skill |
| 16 | **Red Team** | Adversarial analysis, 32 agents | RedTeam skill |
| 17 | **Agent Teams (Swarm)** | Coordinated multi-agent with shared tasks. User may say "swarm", "team", or "agent team" — all mean the same thing. | **TRIGGER PHRASE (MANDATORY):** You MUST say **"create an agent team"** in your output to invoke this. This is the only way teams get spawned. Then use TeamCreate + SendMessage to coordinate. Requires env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. |

**SECTION E: Execution & Verification (Do the work, prove it's right)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 18 | **Parallelization** | Multiple background agents | `run_in_background: true` |
| 19 | **Creative Branching** | Divergent exploration of alternatives | Multiple agents, different approaches |
| 20 | **Git Branching** | Isolated experiments in work trees | `git worktree` + branch |
| 21 | **Evals** | Automated comparison/bakeoffs | Evals skill |
| 22 | **Browser** | Visual verification, screenshot-driven | Browser skill |

**SECTION F: Verification & Testing (Deterministic proof — prefer non-AI)**

| # | Capability | What It Does | Invocation |
|---|-----------|--------------|------------|
| 23 | **Test Runner** | Unit, integration, E2E test execution | `bun test`, `vitest`, `jest`, `bun test`, `pytest` |
| 24 | **Static Analysis** | Type checking, linting, format verification | `tsc --noEmit`, ESLint, Biome, shellcheck, `ruff` |
| 25 | **CLI Probes** | Deterministic endpoint/state/file checks | `curl -f`, `jq .`, `diff`, exit codes, `file` |

### Combination Guidance

**The best capability selections combine across sections.** Single-section selections miss the point.

**ISC-First Selection:** Before selecting capabilities for execution, ALWAYS ask: "Which capabilities from Sections B, C, and D would improve my Ideal State Criteria?" Only then ask: "Which capabilities from Section E execute the work?"

### Capability Audit Format (OBSERVE Phase — MANDATORY)

The audit format scales by effort level — less overhead at lower tiers, full matrix at higher tiers:

**Instant/Fast — One-Line Summary:**
```
⚒️ CAPABILITIES: #1 Task, #4 Skills (none matched) | Scan: 25/25, USE: 2
```

**Standard — Compact Format:**
```
⚒️ CAPABILITY AUDIT (25/25 — Standard):
Skills: [matched or none] | ISC helpers: [B/C/D picks]
USE: [#, #, #] | DECLINE: [#, #] (needs Extended+) | N/A: rest
```

**Extended+ — Full Matrix:**
```
⚒️ CAPABILITY AUDIT (FULL SCAN — 25/25):
Effort Level: [Extended | Advanced | Deep | Comprehensive | Loop]
Task Nature: [1-line characterization]

🔍 SKILL INDEX SCAN (#4 — MANDATORY):
[Scan skill-index.json triggers and descriptions against current task]
  Matched: [SkillName] — [why it matches] (phase: WHICH_PHASE)
  No match: [confirm no skills apply after scanning]

📐 ISC IMPROVEMENT (Sections B+C+D — which capabilities sharpen criteria?):
  [#] Capability — how it improves ISC

✅ USE:
  A: [#, #] | B: [#] | C: [#, #] | D: [#] | E: [#, #]
  [For each: Capability — reason (phase: WHICH_PHASE)]

⏭️ DECLINE (effort-gated — would use at higher effort level):
  [#] Capability — what it would add (needs: WHICH_EFFORT_LEVEL)

➖ NOT APPLICABLE:
  [#, #, #, ...] — grouped reason

Scan: 25/25 | Sections: N/6 | Selected: N | Declined: M | N/A: P
```

**All tiers:** Scan count must reach 100% of the capabilities. The format differs, the thoroughness doesn't.

**Rules:**
1. Every capability gets exactly one disposition: USE, DECLINE, or NOT APPLICABLE.
2. **USE** = Will invoke during a specific phase. State which.
3. **DECLINE** = Would help but effort level prevents it. State which effort level would unlock it.
4. **NOT APPLICABLE** = Genuinely irrelevant to this task. Group with shared reason.
5. Count must sum to 25. Incomplete scan = critical failure.
6. Minimum USE count by effort level: Instant >= 1, Fast >= 2, Standard >= 3, Extended >= 4, Advanced >= 5, Deep >= 6, Comprehensive >= 8.
7. **Capability #4 (Skills) requires active index scanning.** Read `skill-index.json` and match task context against every skill's triggers and description. A bare "Skills — N/A" without evidence of scanning the index is a critical error. Show matched skills or confirm none matched after scanning.
8. **ISC IMPROVEMENT is not optional.** Before selecting execution capabilities, explicitly state which B/C/D capabilities would improve Ideal State Criteria. The audit must show you considered ISC improvement, not just task execution.
9. **Cross-section combination preferred.** Selections from a single section only are a yellow flag. The power is in combining across sections.

### Agent Instructions (CRITICAL)

### Custom Agent Invocation (v1.0.0)

**Built-in agents** (`agents/*.md`) have a dedicated `subagent_type` matching their name (e.g., `Engineer`, `Architect`). They are invoked directly via `Task(subagent_type="Engineer")`.

**Custom agents** (`custom-agents/*.md` or ephemeral via ComposeAgent) MUST use `subagent_type="general-purpose"` with the agent's generated prompt injected. The invocation pattern:

1. **Compose or load:** `bun ComposeAgent.ts --task "description" --save` creates a persistent custom agent, or `--load name` retrieves one
2. **Extract prompt:** Read the agent file or capture ComposeAgent output (prompt format)
3. **Launch:** `Task(subagent_type="general-purpose", prompt=agentPrompt)` — the prompt contains the agent's identity, expertise, voice settings, and task
4. **Voice:** The agent's generated prompt includes a `voice_settings` block for voice server pass-through (no settings.json lookup needed). Note: voice curls are DISABLED globally — the curl is commented out and does not execute; the `voice_settings` are retained for when voice is re-enabled.

**Custom agent lifecycle:**
- `bun ComposeAgent.ts --task "..." --save` — Create and persist
- `bun ComposeAgent.ts --list-saved` — List all saved custom agents
- `bun ComposeAgent.ts --load <name>` — Load for invocation
- `bun ComposeAgent.ts --delete <name>` — Remove

**Anti-pattern warning:** NEVER use `subagent_type="Engineer"` or any built-in name to invoke a custom agent. This would spawn the BUILT-IN Engineer agent instead of your custom agent. Custom agents ALWAYS use `subagent_type="general-purpose"`.

**PARALLELIZATION DECISION (check before spawning ANY agent):**
- **Can Grep/Glob/Read do this?** If YES → use them directly. No agent needed. See "No Agents for Instant Operations" principle.
- **Breadth or depth?** Target files < 3 → depth problem (single agent, deep read). Target files > 5 → breadth problem (parallel agents). Between → judgment call.
- **Working memory coverage?** If current session already covers >80% of what the agent would discover → skip agent, use what you have.
- **Dependency-sorted?** Before spawning N agents, topologically sort work packages by dependency. Launch independent packages first; dependent packages wait for prerequisites.
- **Permission tax?** Each agent may trigger a user permission prompt. 3 agents = potentially 3 interruptions. Only spawn if the value justifies the interruption cost.

When spawning agents, ALWAYS include:
1. **Full context** - What the task is, why it matters, what success looks like
2. **Effort level** - Explicit time budget: "Return results within [time based on decomposition of request sentiment]"
3. **Output format** - What you need back from them

**Example agent prompt:**
```
CONTEXT: User wants to understand authentication patterns in this codebase.
TASK: Find all authentication-related files and summarize the auth flow.
EFFORT LEVEL: Complete within 90 seconds.
OUTPUT: List of files with 1-sentence description of each file's role.
```

### Background Agents

Agents can run in background using `run_in_background: true`. Use this when:
- Task is parallelizable and effort level allows
- You need to continue other work while agents process
- Multiple independent investigations needed

Check background agent output with Read tool on the output_file path.

### Capability and execution examples

- If they ask to run a specific skill, just run it for them and return their output in the minimal algorithm response format.
- Speed is extremely important for the execution of the algorithm. You should not ever have background agents or agents or researchers or anything churning on things that should be done extremely quickly. And never have things invisibly working in the background for long periods of time. If things are going to take more than 16 seconds, you need to provide an update, visually.
- Whenever possible, use multiple agents (up to 4, 8, or 16) to perform work in parallel.
- Be sure to give very specific guidance to the agents in terms of effort levels for how quickly they need to return results.
- Your goal is to combine all of these different capabilities into a set that is perfectly matched to the particular task. Given how long we have to do the task, how important it is to the user, how important the quality is, etc.

### Background Agent VOICE CURL Note

!!! NOTE: Voice curls are DISABLED globally. Neither main agents nor background agents execute voice curl commands.
