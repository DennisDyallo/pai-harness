---
name: Algorithm Reference — Concept & Plan Mode
description: The Algorithm concept (current state → ideal state hill-climbing), implementation via Tasks+PRD, execution guidance/scenarios, and Plan Mode integration. On-demand depth.
---

# The Algorithm Concept & Plan Mode (Reference)

> Relocated from PAI/SKILL.md during the v5 context de-bloat. The behavioral rules in PAI/SKILL.md remain authoritative and always-on. This is the on-demand conceptual reference.

## The Algorithm Concept

1. The most important general hill-climbing activity in all of nature, universally, is the transition from CURRENT STATE to IDEAL STATE.
2. Practically, in modern technology, this means that anything that we want to improve on must have state that's VERIFIABLE at a granular level.
3. This means anything one wants to iteratively improve on MUST get perfectly captured as discrte, granular, binary, and testable criteria that you can use to hill-climb.
4. One CANNOT build those criteria without perfect understanding of what the IDEAL STATE looks like as imagined in the mind of the originator.
5. As such, the capture and dynamic maintanence given new information of the IDEAL STATE is the single most important activity in the process of hill climbing towards Euphoric Surprise. This is why ideal state is the centerpiece of the PAI algorithm.
6. The goal of this skill is to encapsulate the above as a technical avatar of general problem solving.
7. This means using all CAPABILITIES available within the PAI system to transition from the current state to the ideal state as the outer loop, and: Observe, Think, Plan, Build, Execute, Verify, and Learn as the inner, scientific-method-like loop that does the hill climbing towards IDEAL STATE and Euphoric Surprise.
8. This all culminates in the Ideal State Criteria that have been blossomed from the intial request, manicured, nurtured, added to, modified, etc. during the phases of the inner loop, BECOMING THE VERIFICATION criteria in the VERIFY phase.
9. This results in a VERIFIABLE representation of IDEAL STATE that we then hill-climb towards until all criteria are passed and we have achieved Euphoric Surprise.

## Algorithm implementation

- The Algorithm concept above gets implemented using the Claude Code built-in Tasks system AND PRD files on disk.
- The Task system is used to create discrete, binary (yes/no), 8-12 word testable state and anti-state conditions that make up IDEAL STATE, which are also the VERIFICATION criteria during the VERIFICATION step.
- These Ideal State Criteria become actual tasks using the TaskCreate() function of the Task system (working memory).
- Ideal State Criteria are simultaneously persisted to a PRD file on disk (persistent memory), ensuring they survive across sessions and are readable by any agent.
- A PRD is created for every Algorithm run. Simple tasks get a minimal PRD. Complex tasks get full PRDs with child decomposition.
- Further information from any source during any phase of The Algorithm then modify the list using the other functions such as Update, Delete, and other functions on Task items, with changes mirrored to the PRD IDEAL STATE CRITERIA section.
- This is all in service of creating and evolving a perfect representation of IDEAL STATE within the Task system that Claude Code can then work on systematically.
- The intuitive, insightful, and superhumanly reverse engineering of IDEAL STATE from any input is the most important tool to be used by The Algorithm, as it's the only way proper hill-climbing verification can be performed.
- This is where our CAPABILITIES come in, as they are what allow us to better construct and evolve our IDEAL STATE throughout the Algorithm's execution.

## Algorithm execution guidance and scenarios

- **ISC ALWAYS comes first. No exceptions.** Even for fast/obvious tasks, you create ISC before doing work. The DEPTH of ISC varies (4 criteria for simple tasks, 40-150+ for large ones), but ISC existence is non-negotiable. ISC count must be proportional to project scope — see ISC Scale Tiers.
- Speed comes from ISC being FAST TO CREATE for simple tasks, not from skipping ISC entirely. A simple skill invocation still gets 4 quick ISC criteria before execution.
- If you are asked to run a skill, you still create ISC (even minimal), then execute the skill in BUILD/EXECUTE phases using the minimal response format.
- If you are told something ambiguous, difficult, or challenging, that is when you need to use The Algorithm's full power, guided by the CapabilitiesRecommendation hook under /hooks.

## Plan Mode Integration (v1.1.0 — ISC Construction Workshop)

**Plan mode is the structured ISC construction workshop.** It does NOT provide "extra IQ" or enhanced reasoning — extended thinking is always-on with Opus regardless of mode. Plan mode's actual value is:

- **Structured exploration** — forces thorough codebase understanding before committing
- **Read-only tool constraint** — prevents premature execution during planning
- **Approval checkpoint** — user reviews the PRD before BUILD begins
- **Workflow discipline** — enforces deliberate ISC construction through exploration

**When it triggers:** The Algorithm DECIDES to enter plan mode at the PLAN phase when effort level >= Extended. The user's consent is the standard Claude Code approval click — lightweight and expected. The user doesn't have to know to ask for plan mode; the system invokes it when complexity warrants it.

**Context preservation:** ExitPlanMode's default "clear context" option must be AVOIDED. Always select the option that preserves conversation context to maintain Algorithm state across the mode transition.

## Configuration

Custom values in `settings.json`:
- `daidentity.name` - DA's name (Sia)
- `principal.name` - User's name (Dennis)
- `principal.timezone` - User's timezone
