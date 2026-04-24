import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { makePreToolUseInput } from "../../src/core/fixtures";
import { runHook } from "../../src/core/runner";
import { createSandbox } from "../../src/core/sandbox";
import type { Sandbox } from "../../src/core/types";

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/AgentTierContext.hook.ts`;

function extractPrompt(result: Awaited<ReturnType<typeof runHook>>): string {
	return (
		(result.parsedOutput?.hookSpecificOutput?.updatedInput?.prompt as string) ??
		""
	);
}

describe("AgentTierContext", () => {
	describe("opus orchestrator", () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createSandbox({
				settingsOverride: {
					version: "1.0",
					model: "claude-opus-4-6",
					hooks: {},
					permissions: {},
				},
			});
		});

		afterEach(() => {
			sandbox.cleanup();
		});

		it("explicit model param takes precedence over agent default", async () => {
			const input = makePreToolUseInput("Agent", {
				model: "sonnet",
				subagent_type: "Engineer",
				prompt: "build the thing",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Sender tier:    opus (orchestrator)");
			expect(prompt).toContain("Receiver tier:  sonnet (you, Engineer)");
			expect(prompt).toContain("Higher → Lower (trust and execute)");
			expect(prompt).toContain("build the thing");
		});

		it("no model param falls back to agent default tier (Engineer → sonnet)", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Engineer",
				prompt: "do thing",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Receiver tier:  sonnet (default for Engineer)");
			expect(prompt).toContain("Higher → Lower (trust and execute)");
		});

		it("no model param, unknown agent type → unknown receiver", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "CustomThing",
				prompt: "do thing",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain(
				"unknown (no model param, no default for CustomThing)",
			);
			expect(prompt).toContain("Unknown — default to peer skepticism");
		});

		it("opus to Architect (opus) → Equal peer collaboration", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Architect",
				prompt: "design the system",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Receiver tier:  opus (default for Architect)");
			expect(prompt).toContain("Equal → Equal (peer collaboration)");
		});

		it("opus to Plan (opus) → Equal peer collaboration", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Plan",
				prompt: "plan the work",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Receiver tier:  opus (default for Plan)");
			expect(prompt).toContain("Equal → Equal (peer collaboration)");
		});

		it("opus to Designer (opus) → Equal peer collaboration", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Designer",
				prompt: "design the UI",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Receiver tier:  opus (default for Designer)");
			expect(prompt).toContain("Equal → Equal (peer collaboration)");
		});

		it("opus to Explore (haiku) → Higher to Lower", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Explore",
				prompt: "find the file",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Receiver tier:  haiku (default for Explore)");
			expect(prompt).toContain("Higher → Lower (trust and execute)");
		});

		it("preserves original prompt after META block", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Engineer",
				prompt: "## Goal\nBuild the feature\n## Done means\nTests pass",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain(
				"## Goal\nBuild the feature\n## Done means\nTests pass",
			);
		});
	});

	describe("haiku orchestrator", () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createSandbox({
				settingsOverride: {
					version: "1.0",
					model: "claude-haiku-4-5",
					hooks: {},
					permissions: {},
				},
			});
		});

		afterEach(() => {
			sandbox.cleanup();
		});

		it("haiku to Engineer (sonnet) → Lower to Higher", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Engineer",
				prompt: "build it",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Sender tier:    haiku (orchestrator)");
			expect(prompt).toContain("Receiver tier:  sonnet (default for Engineer)");
			expect(prompt).toContain("Lower → Higher (recover intent and expand)");
		});

		it("haiku to Architect (opus) → Lower to Higher", async () => {
			const input = makePreToolUseInput("Agent", {
				subagent_type: "Architect",
				prompt: "design it",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			expect(prompt).toContain("Sender tier:    haiku (orchestrator)");
			expect(prompt).toContain("Lower → Higher (recover intent and expand)");
		});
	});

	describe("edge cases", () => {
		let sandbox: Sandbox;

		beforeEach(() => {
			sandbox = createSandbox({
				settingsOverride: {
					version: "1.0",
					model: "claude-opus-4-6",
					hooks: {},
					permissions: {},
				},
			});
		});

		afterEach(() => {
			sandbox.cleanup();
		});

		it("handles empty stdin gracefully (exit 0, no output)", async () => {
			const input = makePreToolUseInput("Agent", "");
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });
			expect(result.exitCode).toBe(0);
		});

		it("explicit model overrides agent default", async () => {
			const input = makePreToolUseInput("Agent", {
				model: "opus",
				subagent_type: "Engineer",
				prompt: "deep work",
			});
			const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

			expect(result.exitCode).toBe(0);
			const prompt = extractPrompt(result);
			// Explicit opus overrides Engineer's default sonnet
			expect(prompt).toContain("Receiver tier:  opus (you, Engineer)");
			expect(prompt).not.toContain("default for Engineer");
			expect(prompt).toContain("Equal → Equal (peer collaboration)");
		});
	});
});
