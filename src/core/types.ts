/**
 * Core types for the PAI Harness
 */

// Hook event types that Claude Code can fire
export type HookEvent =
	| "PreToolUse"
	| "PostToolUse"
	| "SessionStart"
	| "SessionEnd"
	| "Stop"
	| "UserPromptSubmit"
	| "StopFailure"
	| "Notification";

// Generic hook input — the JSON piped to stdin
export interface HookInput {
	session_id: string;
	hook_event_name: HookEvent;
	tool_name?: string;
	tool_input?: Record<string, unknown> | string;
	tool_output?: string;
	transcript_path?: string;
	last_assistant_message?: string;
	user_prompt?: string;
	[key: string]: unknown;
}

// Result from executing a hook subprocess
export interface HookResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
	parsedOutput: ValidHookOutput | null;
	fileChanges: FileChange[];
}

// Valid JSON output a hook can produce
export interface ValidHookOutput {
	continue?: boolean;
	suppressOutput?: boolean;
	systemMessage?: string;
	decision?: "allow" | "deny" | "block" | "ask";
	reason?: string;
	message?: string;
	hookSpecificOutput?: {
		hookEventName: string;
		permissionDecision?: "allow" | "deny" | "ask";
		permissionDecisionReason?: string;
		updatedInput?: Record<string, unknown>;
		additionalContext?: string;
	};
	[key: string]: unknown;
}

// File change detected in sandbox
export interface FileChange {
	path: string;
	type: "created" | "modified" | "deleted";
	before?: string;
	after?: string;
}

// Sandbox configuration
export interface SandboxOptions {
	settingsOverride?: Record<string, unknown>;
	seedFiles?: Record<string, string>;
	env?: Record<string, string>;
	paiDir?: string;
}

// Sandbox instance
export interface Sandbox {
	dir: string;
	env: Record<string, string>;
	cleanup: () => void;
	snapshotFiles: () => Map<string, string>;
	diffFiles: (before: Map<string, string>) => FileChange[];
}
