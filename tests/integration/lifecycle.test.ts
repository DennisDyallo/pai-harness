import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	makePreToolUseInput,
	makeSessionEndInput,
	makeSessionStartInput,
	makeStopInput,
	makeUserPromptInput,
} from "../../src/core/fixtures";
import { runHook } from "../../src/core/runner";
import { createSandbox } from "../../src/core/sandbox";
import type { Sandbox } from "../../src/core/types";

const HOME = process.env.HOME!;
const HOOKS = {
	LoadContext: join(HOME, ".claude/hooks/LoadContext.hook.ts"),
	CapabilityRecommender: join(
		HOME,
		".claude/hooks/CapabilityRecommender.hook.ts",
	),
	SecurityValidator: join(HOME, ".claude/hooks/SecurityValidator.hook.ts"),
	LastResponseCache: join(HOME, ".claude/hooks/LastResponseCache.hook.ts"),
	WorkCompletionLearning: join(
		HOME,
		".claude/hooks/WorkCompletionLearning.hook.ts",
	),
	SessionCleanup: join(HOME, ".claude/hooks/SessionCleanup.hook.ts"),
};

describe("Full Session Lifecycle", () => {
	let sandbox: Sandbox;
	const sessionId = `lifecycle-test-${Date.now()}`;

	beforeAll(() => {
		sandbox = createSandbox();
		// Mock inference for any hooks that use it
		sandbox.env.PAI_INFERENCE_MOCK = join(sandbox.dir, "mock-inference.json");
		writeFileSync(
			join(sandbox.dir, "mock-inference.json"),
			JSON.stringify({
				depth: "FULL",
				confidence: 0.9,
				reasoning: "Test lifecycle prompt requires full depth.",
			}),
		);
	});

	afterAll(() => {
		sandbox.cleanup();
	});

	it("Step 1: SessionStart (LoadContext) exits 0", async () => {
		const input = makeSessionStartInput({ session_id: sessionId });
		const result = await runHook({
			hookPath: HOOKS.LoadContext,
			input,
			sandbox,
			timeoutMs: 5000,
		});

		expect(result.exitCode).toBe(0);
	});

	it("Step 2: UserPromptSubmit (CapabilityRecommender) exits 0", async () => {
		const input = makeUserPromptInput(
			"Refactor the auth module to use OAuth2",
			{
				session_id: sessionId,
			},
		);
		const result = await runHook({
			hookPath: HOOKS.CapabilityRecommender,
			input,
			sandbox,
			timeoutMs: 10000,
		});

		expect(result.exitCode).toBe(0);
	});

	it("Step 3: PreToolUse (SecurityValidator) allows safe Bash", async () => {
		const input = makePreToolUseInput(
			"Bash",
			{ command: "echo hello world" },
			{
				session_id: sessionId,
			},
		);
		const result = await runHook({
			hookPath: HOOKS.SecurityValidator,
			input,
			sandbox,
		});

		expect(result.exitCode).toBe(0);
		expect(result.parsedOutput?.continue).toBe(true);
	});

	it("Step 4: Stop (LastResponseCache) writes file", async () => {
		const message = "OAuth2 refactoring complete. All tests passing.";
		const input = makeStopInput(message, { session_id: sessionId });
		const result = await runHook({
			hookPath: HOOKS.LastResponseCache,
			input,
			sandbox,
		});

		expect(result.exitCode).toBe(0);

		const cachePath = join(sandbox.dir, "MEMORY", "STATE", "last-response.txt");
		expect(existsSync(cachePath)).toBe(true);
	});

	it("Step 5: SessionEnd hooks exit 0", async () => {
		const input = makeSessionEndInput({ session_id: sessionId });

		// Run WorkCompletionLearning
		const wcResult = await runHook({
			hookPath: HOOKS.WorkCompletionLearning,
			input,
			sandbox,
			timeoutMs: 5000,
		});
		expect(wcResult.exitCode).toBe(0);

		// Run SessionCleanup
		const scResult = await runHook({
			hookPath: HOOKS.SessionCleanup,
			input,
			sandbox,
			timeoutMs: 5000,
		});
		expect(scResult.exitCode).toBe(0);
	});
});
