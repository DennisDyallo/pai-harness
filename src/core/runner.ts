/**
 * Runner — subprocess hook executor via Bun.spawn
 */

import type { HookInput, HookResult, Sandbox, ValidHookOutput } from "./types";

export interface RunOptions {
	hookPath: string;
	input: HookInput;
	sandbox: Sandbox;
	timeoutMs?: number;
}

export async function runHook(options: RunOptions): Promise<HookResult> {
	const { hookPath, input, sandbox, timeoutMs = 5000 } = options;

	const before = sandbox.snapshotFiles();
	const startTime = performance.now();

	const proc = Bun.spawn(["bun", hookPath], {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: sandbox.env,
		cwd: sandbox.dir,
	});

	const inputJson = JSON.stringify(input);
	proc.stdin.write(inputJson);
	proc.stdin.end();

	const timeoutPromise = new Promise<"timeout">((resolve) =>
		setTimeout(() => resolve("timeout"), timeoutMs),
	);

	const result = await Promise.race([
		proc.exited.then(() => "done" as const),
		timeoutPromise,
	]);

	if (result === "timeout") {
		proc.kill();
		const durationMs = performance.now() - startTime;
		return {
			stdout: "",
			stderr: `Hook timed out after ${timeoutMs}ms`,
			exitCode: -1,
			durationMs,
			parsedOutput: null,
			fileChanges: [],
		};
	}

	const durationMs = performance.now() - startTime;
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = proc.exitCode ?? -1;

	let parsedOutput: ValidHookOutput | null = null;
	try {
		const trimmed = stdout.trim();
		if (trimmed) {
			parsedOutput = JSON.parse(trimmed) as ValidHookOutput;
		}
	} catch {}

	const fileChanges = sandbox.diffFiles(before);

	return { stdout, stderr, exitCode, durationMs, parsedOutput, fileChanges };
}
