/**
 * Replay — re-execute captured hook invocations in sandbox
 */

import { existsSync, readFileSync } from "node:fs";
import { runHook } from "../core/runner";
import { createSandbox } from "../core/sandbox";
import type { HookInput } from "../core/types";
import type { InterceptorEntry } from "./interceptor";

export interface ReplayResult {
	hook: string;
	event: string;
	originalExitCode: number;
	replayExitCode: number;
	match: boolean;
	durationMs: number;
}

export async function replayLog(logPath: string): Promise<ReplayResult[]> {
	if (!existsSync(logPath)) return [];

	const content = readFileSync(logPath, "utf-8");
	const results: ReplayResult[] = [];
	const sandbox = createSandbox();

	try {
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			let entry: InterceptorEntry;
			try {
				entry = JSON.parse(trimmed) as InterceptorEntry;
			} catch {
				continue;
			}

			if (!entry.hook || !entry.event) continue;

			const hookInput: HookInput = {
				session_id: "replay",
				hook_event_name: entry.event as HookInput["hook_event_name"],
				...(typeof entry.stdin === "object" && entry.stdin !== null
					? (entry.stdin as Record<string, unknown>)
					: {}),
			};

			const hookResult = await runHook({
				hookPath: entry.hook,
				input: hookInput,
				sandbox,
				timeoutMs: 10000,
			});

			results.push({
				hook: entry.hook,
				event: entry.event,
				originalExitCode: entry.exitCode,
				replayExitCode: hookResult.exitCode,
				match: entry.exitCode === hookResult.exitCode,
				durationMs: hookResult.durationMs,
			});
		}
	} finally {
		sandbox.cleanup();
	}

	return results;
}
