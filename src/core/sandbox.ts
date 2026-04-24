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
import { dirname, join, resolve } from "node:path";
import { resolvePaiDir } from "./paths";
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

/**
 * Discover directory structure from production PAI directory.
 * Returns relative paths to create in sandbox.
 */
function discoverProductionDirs(paiDir: string): string[] {
	const dirs: string[] = [];

	function walk(current: string, prefix: string) {
		try {
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

				const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
				dirs.push(relPath);

				// Only recurse into known structural dirs, not content dirs
				const shouldRecurse =
					[
						"MEMORY",
						"STATE",
						"LEARNING",
						"WISDOM",
						"state",
						"hooks",
						"skills",
						"agents",
					].includes(entry.name) ||
					prefix.startsWith("MEMORY") ||
					prefix.startsWith("state");

				if (shouldRecurse) {
					walk(join(current, entry.name), relPath);
				}
			}
		} catch {
			// Ignore unreadable directories
		}
	}

	walk(paiDir, "");
	return dirs;
}

const DEFAULT_SETTINGS = {
	version: "1.0",
	hooks: {},
	permissions: {},
};

/**
 * Sanitize production settings by removing sensitive data (API keys, tokens).
 */
function sanitizeSettings(
	settings: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized = JSON.parse(JSON.stringify(settings)); // Deep clone

	// Replace API keys with placeholder values
	if (sanitized.env && typeof sanitized.env === "object") {
		const env = sanitized.env as Record<string, string>;
		for (const key of Object.keys(env)) {
			if (
				key.includes("API_KEY") ||
				key.includes("TOKEN") ||
				key.includes("SECRET") ||
				key.includes("PASSWORD")
			) {
				env[key] = "TEST_VALUE_REDACTED";
			}
		}
	}

	return sanitized;
}

/**
 * Seed minimal stub files from production into the sandbox.
 */
function seedProductionStubs(sandboxDir: string) {
	const productionDir = resolvePaiDir();

	// Stub files to create (first N lines only, for context)
	const stubSpecs = [
		{ src: "skills/PAI/SKILL.md", lines: 3 },
		{ src: "skills/PAI/AISTEERINGRULES.md", lines: 3 },
		{ src: "skills/PAI/USER/AISTEERINGRULES.md", lines: 3 },
	];

	for (const spec of stubSpecs) {
		const srcPath = join(productionDir, spec.src);
		if (existsSync(srcPath)) {
			try {
				const content = readFileSync(srcPath, "utf-8");
				const lines = content.split("\n");
				const stub =
					lines.slice(0, spec.lines).join("\n") +
					"\n... (truncated for testing)\n";
				const destPath = join(sandboxDir, spec.src);
				const destDir = dirname(destPath);
				mkdirSync(destDir, { recursive: true });
				writeFileSync(destPath, stub);
			} catch {
				// Skip if file can't be read
			}
		}
	}

	// Create empty learning index structure
	const learningIndexPath = join(
		sandboxDir,
		"MEMORY/STATE/learning-index.json",
	);
	if (!existsSync(learningIndexPath)) {
		mkdirSync(join(sandboxDir, "MEMORY/STATE"), { recursive: true });
		writeFileSync(learningIndexPath, "[]");
	}
}

export function createSandbox(options: SandboxOptions = {}): Sandbox {
	const dir =
		options.paiDir ??
		join(
			tmpdir(),
			`pai-harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		);
	mkdirSync(dir, { recursive: true });

	// Directory structure: use dynamic discovery if requested, otherwise static list
	let dirsToCreate = MEMORY_DIRS;
	if (options.useDynamicDirs) {
		try {
			const productionDir = resolvePaiDir();
			const discoveredDirs = discoverProductionDirs(productionDir);
			if (discoveredDirs.length > 0) {
				dirsToCreate = discoveredDirs;
			}
		} catch {
			// Fall back to static list if discovery fails
		}
	}

	for (const sub of dirsToCreate) {
		mkdirSync(join(dir, sub), { recursive: true });
	}

	// Settings: use override or seed from production
	let settings = options.settingsOverride ?? DEFAULT_SETTINGS;
	if (options.seedFromProduction && !options.settingsOverride) {
		try {
			const productionSettingsPath = join(resolvePaiDir(), "settings.json");
			if (existsSync(productionSettingsPath)) {
				const prodSettings = JSON.parse(
					readFileSync(productionSettingsPath, "utf-8"),
				);
				// Strip sensitive data
				settings = sanitizeSettings(prodSettings);
			}
		} catch {
			// Fall back to default if production settings can't be read
		}
	}
	writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2));

	// Seed stub files from production if requested
	if (options.seedFromProduction) {
		seedProductionStubs(dir);
	}

	if (options.seedFiles) {
		for (const [relPath, content] of Object.entries(options.seedFiles)) {
			const fullPath = join(dir, relPath);
			const parentDir = dirname(fullPath);
			mkdirSync(parentDir, { recursive: true });
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
