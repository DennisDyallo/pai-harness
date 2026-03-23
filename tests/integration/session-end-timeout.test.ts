import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeSessionEndInput } from "../../src/core/fixtures";
import { runHook } from "../../src/core/runner";
import { createSandbox } from "../../src/core/sandbox";
import type { Sandbox } from "../../src/core/types";

const HOME = process.env.HOME!;
const SETTINGS_PATH = join(HOME, ".claude/settings.json");

// Read SessionEnd hooks from settings.json
function getSessionEndHookPaths(): string[] {
	const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
	const sessionEndEntries = settings.hooks?.SessionEnd ?? [];
	const paths: string[] = [];

	for (const entry of sessionEndEntries) {
		const hooks = entry.hooks ?? [];
		for (const hook of hooks) {
			if (hook.type === "command" && hook.command) {
				// Resolve ${PAI_DIR} to actual path
				const resolved = hook.command
					.replace(
						/\$\{PAI_DIR\}/g,
						settings.env?.PAI_DIR || join(HOME, ".claude"),
					)
					.replace(
						/\$PAI_DIR/g,
						settings.env?.PAI_DIR || join(HOME, ".claude"),
					);
				// Extract the script path (may have "bun " prefix)
				const parts = resolved.split(" ");
				const scriptPath = parts[parts.length - 1];
				paths.push(scriptPath);
			}
		}
	}

	return paths;
}

const PER_HOOK_BUDGET_MS = 1500;
const TOTAL_BUDGET_MS = 5000; // Combined budget for all SessionEnd hooks

describe("SessionEnd Timeout Budget", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
		// Mock inference to avoid real API calls from any SessionEnd hook
		sandbox.env.PAI_INFERENCE_MOCK = join(sandbox.dir, "mock-response.json");
		// Write a dummy mock file
		const { writeFileSync } = require("node:fs");
		writeFileSync(join(sandbox.dir, "mock-response.json"), '"ok"');
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	const hookPaths = getSessionEndHookPaths();

	it(`should have SessionEnd hooks configured (found ${hookPaths.length})`, () => {
		expect(hookPaths.length).toBeGreaterThan(0);
	});

	const durations: { path: string; ms: number }[] = [];

	for (const hookPath of hookPaths) {
		const hookName = hookPath.split("/").pop() ?? hookPath;

		it(`${hookName} should complete within ${PER_HOOK_BUDGET_MS}ms`, async () => {
			const input = makeSessionEndInput();
			const result = await runHook({
				hookPath,
				input,
				sandbox,
				timeoutMs: PER_HOOK_BUDGET_MS,
			});

			durations.push({ path: hookPath, ms: result.durationMs });

			// Hook should either complete successfully or exit 0
			// (timeout returns exitCode -1)
			expect(result.exitCode).not.toBe(-1);
			expect(result.durationMs).toBeLessThan(PER_HOOK_BUDGET_MS);
		});
	}

	it(`total combined time should be within ${TOTAL_BUDGET_MS}ms budget`, async () => {
		// Run all hooks sequentially and measure total time
		const input = makeSessionEndInput();
		let totalMs = 0;

		for (const hookPath of hookPaths) {
			const result = await runHook({
				hookPath,
				input,
				sandbox,
				timeoutMs: PER_HOOK_BUDGET_MS,
			});
			totalMs += result.durationMs;
		}

		expect(totalMs).toBeLessThan(TOTAL_BUDGET_MS);
	});
});
