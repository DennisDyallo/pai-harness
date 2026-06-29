/**
 * Context Assembly — simulate what gets injected at SessionStart
 *
 * Collects CLAUDE.md, loadAtStartup files, LoadContext hook output,
 * and MEMORY.md to show the full context picture.
 */

import {
	type Dirent,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { resolveHooksDir, resolvePaiDir } from "../core/paths";

const MEMORY_MD_MAX_LINES = 200;
const HOOK_TIMEOUT_MS = 5000;

function expandPath(p: string): string {
	const home = process.env.HOME || homedir();
	return p
		.replace(/^\$HOME(?=\/|$)/, home)
		.replace(/^\$\{HOME\}(?=\/|$)/, home)
		.replace(/^~(?=\/|$)/, home);
}

/**
 * Normalize the `loadAtStartup` setting into a flat list of file paths.
 * Handles the production `{ files: [...] }` shape and the legacy array shape.
 */
export function extractStartupFiles(loadAtStartup: unknown): string[] {
	if (Array.isArray(loadAtStartup)) {
		return loadAtStartup.filter((f): f is string => typeof f === "string");
	}
	if (
		loadAtStartup &&
		typeof loadAtStartup === "object" &&
		Array.isArray((loadAtStartup as { files?: unknown }).files)
	) {
		return (loadAtStartup as { files: unknown[] }).files.filter(
			(f): f is string => typeof f === "string",
		);
	}
	return [];
}

/**
 * Resolve a loadAtStartup path. Absolute / $HOME / ~ paths are expanded;
 * bare relative paths resolve against the PAI dir.
 */
function resolveStartupPath(filePath: string, paiDir: string): string | null {
	const expanded = expandPath(filePath);
	if (isAbsolute(expanded)) return expanded;
	return join(paiDir, expanded);
}

/**
 * Extract the frontmatter `description:` value from a SKILL.md file's content.
 * Returns an empty string if no description frontmatter is present.
 */
export function extractSkillDescription(content: string): string {
	const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
	const block = fm ? fm[1] : content;
	const match = block.match(/^description:\s*(.+)$/m);
	return match ? match[1].trim() : "";
}

/**
 * Discover all SKILL.md files under skills/, following symlinks.
 * Returns paths relative to the skills dir.
 */
function discoverSkillMdFiles(skillsDir: string): string[] {
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

export interface ContextPiece {
	source: string;
	content: string;
	chars: number;
	/** Absolute path this piece was read from (omitted for synthetic/missing/MCP pieces). */
	resolvedPath?: string;
}

/**
 * Files that the LoadContext SessionStart hook injects into context at the
 * start of every first prompt. We model their FULL bodies statically (read
 * from the PAI dir / clone) rather than executing the live hook — executing
 * the hook would read live production state and break isolation. The dynamic
 * relationship/work context the hook also emits is small and variable; it is
 * intentionally NOT modeled here (noted in the budget as not-modeled).
 *
 * Paths are relative to the PAI dir.
 */
const LOADCONTEXT_INJECTED_FILES = [
	"skills/PAI/SKILL.md",
	"skills/PAI/AISTEERINGRULES.md",
	"skills/PAI/USER/AISTEERINGRULES.md",
];

/**
 * Serialized cost of one MCP server's tool schemas, as measured offline by
 * the MCP schema measurer (src/analyzers/mcp-schema-cost.ts).
 */
export interface McpSchemaCost {
	server: string;
	chars: number;
	serialized: string;
	error?: string;
}

/**
 * Statically assemble the first-prompt startup context budget.
 *
 * ISOLATION NOTE: every file read here resolves under `paiDir` (the clone in
 * test/experiment mode). Each returned piece carries `resolvedPath` so callers
 * can prove no live `~/.claude` path was read during this RUN. (Clone *build*
 * legitimately reads live config once — that's a separate phase; this RUN must
 * not.) Pass `recordedReads` to capture every absolute path read, in order.
 */
export function assembleContext(
	paiDir?: string,
	recordedReads?: string[],
): ContextPiece[] {
	const dir = paiDir ?? resolvePaiDir();
	const pieces: ContextPiece[] = [];

	// Helper: read a file, record its path, return content (or null if absent).
	const readTracked = (abs: string): string | null => {
		if (!existsSync(abs)) return null;
		try {
			const content = readFileSync(abs, "utf-8");
			recordedReads?.push(abs);
			return content;
		} catch {
			return null;
		}
	};

	// 1. CLAUDE.md
	const claudeMd = join(dir, "CLAUDE.md");
	const claudeMdContent = readTracked(claudeMd);
	if (claudeMdContent !== null) {
		pieces.push({
			source: "CLAUDE.md",
			content: claudeMdContent,
			chars: claudeMdContent.length,
			resolvedPath: claudeMd,
		});
	}

	// 2. loadAtStartup files from settings.json
	//
	// Production schema is `loadAtStartup: { files: [...] }`. The legacy/array
	// form (`loadAtStartup: [...]`) is still tolerated. File paths may be
	// relative to the PAI dir (e.g. "skills/PAI/USER/DAIDENTITY.md") or use
	// $HOME / ~ prefixes. Dangling refs are modeled as 0-char pieces so they
	// show up in the budget as "missing" rather than vanishing silently.
	const settingsPath = join(dir, "settings.json");
	const settingsRaw = readTracked(settingsPath);
	if (settingsRaw !== null) {
		try {
			const settings = JSON.parse(settingsRaw);
			const startupFiles = extractStartupFiles(settings.loadAtStartup);
			for (const filePath of startupFiles) {
				const resolved = resolveStartupPath(filePath, dir);
				const content = resolved ? readTracked(resolved) : null;
				if (resolved && content !== null) {
					pieces.push({
						source: `loadAtStartup: ${filePath}`,
						content,
						chars: content.length,
						resolvedPath: resolved,
					});
				} else {
					// Dangling ref — model as a 0-char piece for visibility.
					pieces.push({
						source: `loadAtStartup (missing): ${filePath}`,
						content: "",
						chars: 0,
					});
				}
			}
		} catch {}
	}

	// 3. LoadContext SessionStart injection (modeled statically — full bodies).
	// These full files enter context at the start of every first prompt via the
	// LoadContext hook. They are the dominant first-prompt cost (esp. SKILL.md)
	// and are distinct from the skill-description catalog piece below. We read
	// them from the PAI dir / clone rather than executing the hook (which would
	// read live state and break isolation).
	for (const rel of LOADCONTEXT_INJECTED_FILES) {
		const abs = join(dir, rel);
		const content = readTracked(abs);
		if (content !== null) {
			pieces.push({
				source: `LoadContext injection: ${rel}`,
				content,
				chars: content.length,
				resolvedPath: abs,
			});
		}
	}

	// 4. Skill descriptions — frontmatter `description:` from every SKILL.md.
	// These are loaded into the model's context as the skill catalog, so they
	// count against the budget. Aggregated into a single piece.
	const skillsDir = join(dir, "skills");
	const skillFiles = discoverSkillMdFiles(skillsDir);
	if (skillFiles.length > 0) {
		const descriptions: string[] = [];
		for (const rel of skillFiles) {
			const content = readTracked(join(skillsDir, rel));
			if (content !== null) {
				const desc = extractSkillDescription(content);
				if (desc) descriptions.push(desc);
			}
		}
		const joined = descriptions.join("\n");
		pieces.push({
			source: `skill descriptions (${descriptions.length} skills)`,
			content: joined,
			chars: joined.length,
		});
	}

	// 5. MEMORY.md (first N lines)
	const memoryMd = join(dir, "MEMORY.md");
	const memoryRaw = readTracked(memoryMd);
	if (memoryRaw !== null) {
		const lines = memoryRaw.split("\n");
		const content = lines.slice(0, MEMORY_MD_MAX_LINES).join("\n");
		pieces.push({
			source: `MEMORY.md (${Math.min(lines.length, MEMORY_MD_MAX_LINES)}/${lines.length} lines)`,
			content,
			chars: content.length,
			resolvedPath: memoryMd,
		});
	}

	return pieces;
}

/**
 * Convert offline-measured MCP/plugin tool schema costs into ContextPieces.
 * Each server becomes one piece; failed measurements become 0-char pieces with
 * the error noted in the source label.
 */
export function mcpCostsToPieces(costs: McpSchemaCost[]): ContextPiece[] {
	return costs.map((c) => ({
		source: c.error
			? `MCP tools: ${c.server} (unmeasured: ${c.error})`
			: `MCP tools: ${c.server}`,
		content: c.serialized,
		chars: c.chars,
	}));
}

export async function assembleContextWithHook(
	paiDir?: string,
	hookPath?: string,
): Promise<ContextPiece[]> {
	const dir = paiDir ?? resolvePaiDir();
	const pieces = assembleContext(dir);

	// 4. Run LoadContext hook in sandbox and capture stdout
	const loadContextPath =
		hookPath ?? join(resolveHooksDir(), "LoadContext.hook.ts");
	if (existsSync(loadContextPath)) {
		try {
			const proc = Bun.spawn(["bun", loadContextPath], {
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
				env: {
					...process.env,
					PAI_DIR: dir,
					CLAUDE_CONFIG_DIR: dir,
				} as Record<string, string>,
			});

			const input = JSON.stringify({
				session_id: `context-assembly-${Date.now()}`,
				hook_event_name: "SessionStart",
			});
			proc.stdin.write(input);
			proc.stdin.end();

			const timeout = new Promise<"timeout">((resolve) =>
				setTimeout(() => resolve("timeout"), HOOK_TIMEOUT_MS),
			);
			const result = await Promise.race([
				proc.exited.then(() => "done" as const),
				timeout,
			]);

			if (result === "done") {
				const stdout = await new Response(proc.stdout).text();
				if (stdout.trim()) {
					try {
						const parsed = JSON.parse(stdout.trim());
						const hookContent = parsed.systemMessage ?? stdout.trim();
						pieces.push({
							source: "LoadContext hook (systemMessage)",
							content: hookContent,
							chars: hookContent.length,
						});
					} catch {
						pieces.push({
							source: "LoadContext hook (raw)",
							content: stdout.trim(),
							chars: stdout.trim().length,
						});
					}
				}
			}
		} catch (err) {
			pieces.push({
				source: "LoadContext hook (error)",
				content: `Hook failed: ${err instanceof Error ? err.message : String(err)}`,
				chars: 0,
			});
		}
	}

	return pieces;
}
