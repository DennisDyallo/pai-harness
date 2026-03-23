import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { makeUserPromptInput } from "../../../src/core/fixtures";
import { runHook } from "../../../src/core/runner";
import { createSandbox } from "../../../src/core/sandbox";
import type { Sandbox } from "../../../src/core/types";

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/CapabilityRecommender.hook.ts`;

describe("CapabilityRecommender", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	it('should classify greeting "hey" as MINIMAL (fast-path)', async () => {
		const input = makeUserPromptInput("hey");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("DEPTH CLASSIFICATION: MINIMAL");
	});

	it('should classify "hello" as MINIMAL', async () => {
		const input = makeUserPromptInput("hello");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("MINIMAL");
	});

	it('should classify "thanks" as MINIMAL', async () => {
		const input = makeUserPromptInput("thanks");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("MINIMAL");
	});

	it('should classify rating "8" as MINIMAL', async () => {
		const input = makeUserPromptInput("8");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("MINIMAL");
	});

	it("should classify task prompt as FULL (fast-path task signal)", async () => {
		const input = makeUserPromptInput(
			"implement the auth system with JWT tokens and refresh token rotation",
		);
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("DEPTH CLASSIFICATION: FULL");
	});

	it("should classify slash commands as FULL", async () => {
		const input = makeUserPromptInput("/research quantum computing advances");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("FULL");
	});

	it("should classify multi-line long prompts as FULL", async () => {
		const prompt =
			"Please refactor the authentication module.\nIt needs to support OAuth2 and SAML.\nAlso add comprehensive test coverage.";
		const input = makeUserPromptInput(prompt);
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("FULL");
	});

	it("should exit silently on empty prompt", async () => {
		const input = makeUserPromptInput("");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		// Empty prompt produces no classification output
		expect(result.stdout.trim()).toBe("");
	});

	it("should exit silently on system-injected text", async () => {
		const input = makeUserPromptInput(
			"<system-reminder>Internal context</system-reminder>",
		);
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("");
	});

	it("should complete fast-path classification within 200ms", async () => {
		const input = makeUserPromptInput("hey");
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.durationMs).toBeLessThan(200);
	});
});
