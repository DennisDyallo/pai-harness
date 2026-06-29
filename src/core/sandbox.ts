/**
 * Sandbox — temp directory factory for isolated hook testing
 */

import {
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
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
 * Recursively sanitize any key-like values in an arbitrary JSON structure,
 * replacing secret-looking values with a redacted placeholder. Used for the
 * synthetic `.claude.json` (mcpServers can carry env blocks with tokens).
 */
function sanitizeValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sanitizeValue);
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
			if (
				typeof v === "string" &&
				(key.includes("API_KEY") ||
					key.includes("TOKEN") ||
					key.includes("SECRET") ||
					key.includes("PASSWORD") ||
					key.toLowerCase().includes("apikey"))
			) {
				out[key] = "TEST_VALUE_REDACTED";
			} else {
				out[key] = sanitizeValue(v);
			}
		}
		return out;
	}
	return value;
}

/**
 * Context-relevant LoadContext inputs to clone (relative to PAI dir).
 */
const CLONE_CONTEXT_FILES = [
	"CLAUDE.md",
	"skills/PAI/AISTEERINGRULES.md",
	"skills/PAI/USER/AISTEERINGRULES.md",
	"skills/PAI/USER/DAIDENTITY.md",
	"plugins/installed_plugins.json",
];

/**
 * Full-fidelity clone of context-relevant live PAI config into the sandbox.
 *
 * Copies (read-only from production): settings.json (sanitized), global
 * CLAUDE.md, the project CLAUDE.md (if provided), every skills/**\/SKILL.md,
 * the LoadContext inputs, and plugins/installed_plugins.json. Also writes a
 * SYNTHETIC `~/.claude.json` into the clone's HOME containing only the
 * sanitized `mcpServers` block extracted from the live `~/.claude.json`.
 *
 * Skips bulk MEMORY/ and caches. Never writes outside `sandboxDir`.
 *
 * BUILD vs RUN boundary: this is the clone BUILD phase. It legitimately reads
 * live `~/.claude` and `~/.claude.json` ONCE — that is how cloning works. The
 * zero-live-read isolation invariant applies to the measured RUN (context
 * assembly against the clone), NOT to this build. Tests therefore build the
 * clone first, then instrument, then assemble.
 */
function cloneContextConfig(sandboxDir: string) {
	const productionDir = resolvePaiDir();

	function copyFile(srcAbs: string, relDest: string, sanitizeJson = false) {
		if (!existsSync(srcAbs)) return;
		try {
			let content = readFileSync(srcAbs, "utf-8");
			if (sanitizeJson) {
				try {
					content = JSON.stringify(sanitizeValue(JSON.parse(content)), null, 2);
				} catch {
					// Leave as-is if not valid JSON
				}
			}
			const destPath = join(sandboxDir, relDest);
			mkdirSync(dirname(destPath), { recursive: true });
			writeFileSync(destPath, content);
		} catch {
			// Skip unreadable files
		}
	}

	// settings.json — sanitized (env/secret redaction)
	const settingsSrc = join(productionDir, "settings.json");
	if (existsSync(settingsSrc)) {
		try {
			const prod = JSON.parse(readFileSync(settingsSrc, "utf-8"));
			writeFileSync(
				join(sandboxDir, "settings.json"),
				JSON.stringify(sanitizeSettings(prod), null, 2),
			);
		} catch {
			// Skip if unreadable
		}
	}

	// Context-relevant files (follow symlinks via readFileSync, which does)
	for (const rel of CLONE_CONTEXT_FILES) {
		copyFile(
			join(productionDir, rel),
			rel,
			rel.endsWith(".json"), // sanitize JSON manifests
		);
	}

	// Every skills/**/SKILL.md (frontmatter description is what matters; full file is fine)
	const skillsDir = join(productionDir, "skills");
	for (const skillMd of discoverSkillFiles(skillsDir)) {
		const rel = `skills/${skillMd}`;
		copyFile(join(skillsDir, skillMd), rel);
	}

	// Synthetic ~/.claude.json with ONLY sanitized mcpServers, written into the
	// clone's HOME (the clone dir itself doubles as HOME for isolation).
	const liveClaudeJson = join(homedir(), ".claude.json");
	let mcpServers: Record<string, unknown> = {};
	if (existsSync(liveClaudeJson)) {
		try {
			const parsed = JSON.parse(readFileSync(liveClaudeJson, "utf-8"));
			if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
				mcpServers = sanitizeValue(parsed.mcpServers) as Record<
					string,
					unknown
				>;
			}
		} catch {
			// No mcpServers if unreadable
		}
	}
	writeFileSync(
		join(sandboxDir, ".claude.json"),
		JSON.stringify({ mcpServers }, null, 2),
	);
}

/**
 * Discover all SKILL.md files under a skills directory, following symlinks
 * (the production skills dir is a symlink into the Obsidian vault, and each
 * skill may itself be reachable through symlinks). Returns paths relative to
 * `skillsDir`.
 */
function discoverSkillFiles(skillsDir: string): string[] {
	const found: string[] = [];
	if (!existsSync(skillsDir)) return found;

	function walk(current: string, prefix: string) {
		let entries: Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const abs = join(current, entry.name);
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
			// Resolve symlinks/dirs/files via statSync (handles symlinked skills)
			let isDir = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const st = statSync(abs);
					isDir = st.isDirectory();
					isFile = st.isFile();
				} catch {
					continue;
				}
			}
			if (isFile && entry.name === "SKILL.md") {
				found.push(rel);
			} else if (isDir && !entry.name.startsWith(".")) {
				walk(abs, rel);
			}
		}
	}

	walk(skillsDir, "");
	return found;
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

	// Full-fidelity clone: copy context-relevant config + synthetic .claude.json.
	// Runs before the settings/stub seeding so an explicit settingsOverride or
	// seedFromProduction can still layer on top if requested.
	if (options.cloneFromProduction) {
		cloneContextConfig(dir);
		if (options.projectClaudeMd && existsSync(options.projectClaudeMd)) {
			try {
				const content = readFileSync(options.projectClaudeMd, "utf-8");
				writeFileSync(join(dir, "PROJECT_CLAUDE.md"), content);
			} catch {}
		}
	}

	// Settings: use override or seed from production.
	// (Clone already wrote a sanitized settings.json; only overwrite if the
	// caller explicitly provided an override or asked to seed.)
	const cloneWroteSettings =
		options.cloneFromProduction && existsSync(join(dir, "settings.json"));
	let settings = options.settingsOverride ?? DEFAULT_SETTINGS;
	if (
		options.seedFromProduction &&
		!options.settingsOverride &&
		!cloneWroteSettings
	) {
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
	// Don't clobber the clone's sanitized settings unless an override was given.
	if (!cloneWroteSettings || options.settingsOverride) {
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify(settings, null, 2),
		);
	}

	// Seed stub files from production if requested (clone already covers these)
	if (options.seedFromProduction && !options.cloneFromProduction) {
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
		// In clone mode, HOME points at the clone so the synthetic ~/.claude.json
		// (mcpServers only) is read instead of the live one.
		HOME: options.cloneFromProduction ? dir : (process.env.HOME ?? "/tmp"),
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
