/**
 * Sandbox — temp directory factory for isolated hook testing
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FileChange, Sandbox, SandboxOptions } from "./types";

const MEMORY_DIRS = [
	"MEMORY/STATE",
	"MEMORY/LEARNING/ALGORITHM",
	"MEMORY/LEARNING/SYSTEM",
	"MEMORY/LEARNING/FAILURES",
	"MEMORY/WISDOM/FRAMES",
	"MEMORY/WORK",
	"MEMORY/SECURITY",
];

const STUB_DIR = resolve(import.meta.dir, "../mocks/stubs");

const DEFAULT_SETTINGS = {
	version: "1.0",
	hooks: {},
	permissions: {},
};

export function createSandbox(options: SandboxOptions = {}): Sandbox {
	const dir =
		options.paiDir ??
		join(
			tmpdir(),
			`pai-harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		);
	mkdirSync(dir, { recursive: true });

	for (const sub of MEMORY_DIRS) {
		mkdirSync(join(dir, sub), { recursive: true });
	}

	const settings = options.settingsOverride ?? DEFAULT_SETTINGS;
	writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2));

	if (options.seedFiles) {
		for (const [relPath, content] of Object.entries(options.seedFiles)) {
			const fullPath = join(dir, relPath);
			mkdirSync(fullPath.substring(0, fullPath.lastIndexOf("/")), {
				recursive: true,
			});
			writeFileSync(fullPath, content);
		}
	}

	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
		CLAUDE_CONFIG_DIR: dir,
		PAI_DIR: dir,
		HOME: process.env.HOME ?? "/tmp",
		SSH_AUTH_SOCK: "",
		GPG_AGENT_INFO: "",
		ELEVENLABS_API_KEY: "",
		PAI_HOOK_LOG_LEVEL: "error",
		...options.env,
	};

	if (existsSync(STUB_DIR)) {
		env.PATH = `${STUB_DIR}:${env.PATH ?? ""}`;
	}

	function walkDir(dirPath: string): Map<string, string> {
		const result = new Map<string, string>();
		if (!existsSync(dirPath)) return result;
		function walk(current: string) {
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const fullPath = join(current, entry.name);
				if (entry.isDirectory()) {
					walk(fullPath);
				} else if (entry.isFile()) {
					try {
						result.set(fullPath, readFileSync(fullPath, "utf-8"));
					} catch {}
				}
			}
		}
		walk(dirPath);
		return result;
	}

	function snapshotFiles(): Map<string, string> {
		return walkDir(dir);
	}

	function diffFiles(before: Map<string, string>): FileChange[] {
		const after = snapshotFiles();
		const changes: FileChange[] = [];
		for (const [path, content] of after) {
			const prev = before.get(path);
			if (prev === undefined) {
				changes.push({ path, type: "created", after: content });
			} else if (prev !== content) {
				changes.push({ path, type: "modified", before: prev, after: content });
			}
		}
		for (const [path, content] of before) {
			if (!after.has(path)) {
				changes.push({ path, type: "deleted", before: content });
			}
		}
		return changes;
	}

	function cleanup() {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}

	return { dir, env, cleanup, snapshotFiles, diffFiles };
}
