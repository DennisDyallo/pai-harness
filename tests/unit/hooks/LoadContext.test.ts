import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { makeSessionStartInput } from "../../../src/core/fixtures";
import { runHook } from "../../../src/core/runner";
import { createSandbox } from "../../../src/core/sandbox";
import type { Sandbox } from "../../../src/core/types";

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/LoadContext.hook.ts`;

describe("LoadContext", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	it("should exit 0 on SessionStart input", async () => {
		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
	});

	it("should produce stdout output (context or ready message)", async () => {
		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		// LoadContext always prints at least "PAI session ready..." or context
		expect(result.stdout.trim().length).toBeGreaterThan(0);
	});

	it("should handle empty MEMORY dir gracefully", async () => {
		// Default sandbox already has empty MEMORY dirs
		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
	});

	it("should load startup files when configured", async () => {
		sandbox = createSandbox({
			settingsOverride: {
				version: "1.0",
				hooks: {},
				permissions: {},
				loadAtStartup: {
					files: ["test-context.md"],
				},
			},
			seedFiles: {
				"test-context.md": "# Test Context\nThis is injected at startup.",
			},
		});

		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Test Context");
	});

	it("should skip context for subagents", async () => {
		sandbox = createSandbox({
			env: {
				CLAUDE_AGENT_TYPE: "subagent",
			},
		});

		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		// Subagent should produce no stdout context
		expect(result.stdout.trim()).toBe("");
	});

	it("should complete within 2000ms", async () => {
		const input = makeSessionStartInput();
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.durationMs).toBeLessThan(2000);
	});
});
