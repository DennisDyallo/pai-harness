/**
 * Interceptor — logs hook I/O to JSONL file via PAI_HARNESS_LOG env var
 */

import { appendFileSync } from "node:fs";

export interface InterceptorEntry {
	ts: string;
	hook: string;
	event: string;
	stdin: unknown;
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
}

export function logHookInvocation(
	hook: string,
	event: string,
	stdin: unknown,
	stdout: string,
	stderr: string,
	exitCode: number,
	durationMs: number,
): void {
	const logPath = process.env.PAI_HARNESS_LOG;
	if (!logPath) return;

	const entry: InterceptorEntry = {
		ts: new Date().toISOString(),
		hook,
		event,
		stdin,
		stdout,
		stderr,
		exitCode,
		durationMs,
	};

	appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}
