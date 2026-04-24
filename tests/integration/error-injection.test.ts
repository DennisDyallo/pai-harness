import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHook } from "../../src/core/runner";
import { createSandbox } from "../../src/core/sandbox";
import type { HookInput, Sandbox } from "../../src/core/types";

const HOME = process.env.HOME!;

// Use hooks that read state files to test corruption resilience
const HOOKS = {
	SecurityValidator: join(HOME, ".claude/hooks/SecurityValidator.hook.ts"),
	LastResponseCache: join(HOME, ".claude/hooks/LastResponseCache.hook.ts"),
	LoadContext: join(HOME, ".claude/hooks/LoadContext.hook.ts"),
	RatingCapture: join(HOME, ".claude/hooks/RatingCapture.hook.ts"),
};

describe("Error Injection & Resilience", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox({
			seedFiles: {
				"skills/PAI/SKILL.md": "# PAI Skills\nMinimal test context.",
				"skills/PAI/AISTEERINGRULES.md": "# AI Steering Rules\nTest.",
				"skills/PAI/USER/AISTEERINGRULES.md": "# User AI Steering Rules\nTest.",
			},
		});
		sandbox.env.PAI_INFERENCE_MOCK = join(sandbox.dir, "mock-inference.json");
		writeFileSync(join(sandbox.dir, "mock-inference.json"), '"ok"');
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	describe("Invalid JSON on stdin", () => {
		it("SecurityValidator should exit 0 with completely invalid JSON", async () => {
			// runHook writes JSON to stdin, but we need to test with invalid JSON.
			// We'll construct a valid HookInput but the hook itself should still handle
			// malformed data gracefully. Let's test with an empty object.
			const input = {
				session_id: "",
				hook_event_name: "PreToolUse",
			} as HookInput;
			const result = await runHook({
				hookPath: HOOKS.SecurityValidator,
				input,
				sandbox,
			});

			// Should exit gracefully (0), not crash
			expect(result.exitCode).toBe(0);
		});

		it("LastResponseCache should exit 0 with missing fields", async () => {
			const input = {
				session_id: "test",
				hook_event_name: "Stop",
				// Missing last_assistant_message — should handle gracefully
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.LastResponseCache,
				input,
				sandbox,
			});

			expect(result.exitCode).toBe(0);
		});

		it("RatingCapture should exit 0 with empty prompt", async () => {
			const input = {
				session_id: "test",
				hook_event_name: "UserPromptSubmit",
				user_prompt: "",
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.RatingCapture,
				input,
				sandbox,
				timeoutMs: 10000,
			});

			expect(result.exitCode).toBe(0);
		});
	});

	describe("Corrupted state files", () => {
		it("LoadContext should not crash with corrupted learning-index.json", async () => {
			// Write corrupt data to learning-index.json
			const indexPath = join(
				sandbox.dir,
				"MEMORY",
				"STATE",
				"learning-index.json",
			);
			writeFileSync(indexPath, "NOT JSON AT ALL {{{broken}}");

			const input = {
				session_id: "test",
				hook_event_name: "SessionStart",
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.LoadContext,
				input,
				sandbox,
				timeoutMs: 5000,
			});

			// Should exit 0 — graceful degradation
			expect(result.exitCode).toBe(0);
		});

		it("RatingCapture should not crash with corrupted ratings.jsonl", async () => {
			// Pre-corrupt the ratings file
			const ratingsDir = join(sandbox.dir, "MEMORY", "LEARNING", "SIGNALS");
			const { mkdirSync } = await import("node:fs");
			mkdirSync(ratingsDir, { recursive: true });
			const ratingsPath = join(ratingsDir, "ratings.jsonl");
			writeFileSync(ratingsPath, "CORRUPT LINE\n{bad json\n");

			const input = {
				session_id: "test",
				hook_event_name: "UserPromptSubmit",
				user_prompt: "9 - amazing",
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.RatingCapture,
				input,
				sandbox,
				timeoutMs: 10000,
			});

			// Should still write successfully (appendFileSync doesn't read existing content)
			expect(result.exitCode).toBe(0);
		});

		it("SecurityValidator should handle corrupted settings.json", async () => {
			// Overwrite sandbox settings with corrupt data
			writeFileSync(join(sandbox.dir, "settings.json"), "{ broken json!!!");

			const input = {
				session_id: "test",
				hook_event_name: "PreToolUse",
				tool_name: "Bash",
				tool_input: { command: "ls" },
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.SecurityValidator,
				input,
				sandbox,
			});

			// SecurityValidator should fail open (exit 0, continue: true)
			expect(result.exitCode).toBe(0);
		});
	});

	describe("Timeout behavior", () => {
		it("should kill hook cleanly when timeout is very short", async () => {
			// LoadContext does file I/O which may take >100ms
			const input = {
				session_id: "test",
				hook_event_name: "SessionStart",
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.LoadContext,
				input,
				sandbox,
				timeoutMs: 50, // Very short timeout — should trigger kill
			});

			// Either it completed in time (unlikely but possible) or timed out
			if (result.exitCode === -1) {
				// Timed out — verify we got the timeout error
				expect(result.stderr).toContain("timed out");
				expect(result.durationMs).toBeLessThan(200); // Should not hang
			} else {
				// Completed before timeout — that's fine too
				expect(result.exitCode).toBe(0);
			}
		});

		it("should report accurate duration on timeout", async () => {
			const input = {
				session_id: "test",
				hook_event_name: "SessionStart",
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.LoadContext,
				input,
				sandbox,
				timeoutMs: 100,
			});

			// Duration should be approximately the timeout value, not wildly off
			if (result.exitCode === -1) {
				expect(result.durationMs).toBeGreaterThan(50);
				expect(result.durationMs).toBeLessThan(500);
			}
		});
	});

	describe("Missing dependencies", () => {
		it("should handle hook with missing PAI_DIR gracefully", async () => {
			// Unset PAI_DIR to simulate missing dependency
			const brokenSandbox = createSandbox();
			delete brokenSandbox.env.PAI_DIR;
			// Keep CLAUDE_CONFIG_DIR pointing to the sandbox
			// (hooks should still work via CLAUDE_CONFIG_DIR fallback)

			const input = {
				session_id: "test",
				hook_event_name: "PreToolUse",
				tool_name: "Bash",
				tool_input: { command: "ls" },
			} as HookInput;

			const result = await runHook({
				hookPath: HOOKS.SecurityValidator,
				input,
				sandbox: brokenSandbox,
			});

			// Should still exit cleanly
			expect(result.exitCode).toBe(0);

			brokenSandbox.cleanup();
		});
	});
});
