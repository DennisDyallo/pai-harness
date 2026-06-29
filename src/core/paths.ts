/**
 * Centralized path resolution for PAI directories
 *
 * All modules that need to resolve PAI directories should use these functions
 * instead of constructing paths manually. This enables dynamic resolution via
 * environment variables and ensures consistent behavior across the harness.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the PAI directory, checking env vars first before falling back to default.
 *
 * Resolution order:
 * 1. CLAUDE_CONFIG_DIR (used by sandbox isolation)
 * 2. PAI_DIR (canonical PAI env var)
 * 3. ~/.claude (production default)
 */
export function resolvePaiDir(): string {
	return (
		process.env.CLAUDE_CONFIG_DIR ||
		process.env.PAI_DIR ||
		join(homedir(), ".claude")
	);
}

/**
 * Resolve the hooks directory within PAI.
 */
export function resolveHooksDir(): string {
	return join(resolvePaiDir(), "hooks");
}

/**
 * Resolve the settings.json path within PAI.
 */
export function resolveSettingsPath(): string {
	return join(resolvePaiDir(), "settings.json");
}

/**
 * Resolve the projects directory (for session logs).
 */
export function resolveProjectsDir(): string {
	return join(resolvePaiDir(), "projects");
}

/**
 * Resolve MEMORY directory structure.
 */
export function resolveMemoryDir(): string {
	return join(resolvePaiDir(), "MEMORY");
}

export function resolveMemoryStatePath(): string {
	return join(resolveMemoryDir(), "STATE");
}

export function resolveMemoryLearningPath(): string {
	return join(resolveMemoryDir(), "LEARNING");
}

/**
 * Resolve the HOME directory, honoring an override.
 *
 * Resolution order:
 * 1. HOME env var (set by sandbox isolation)
 * 2. ~ (os.homedir())
 *
 * Used so a cloned sandbox can point HOME at the clone root and have
 * `~/.claude.json` resolve to the synthetic copy instead of the live one.
 */
export function resolveHome(): string {
	return process.env.HOME || homedir();
}

/**
 * Resolve the path to `~/.claude.json` (the global Claude Code config that
 * holds the `mcpServers` block). Respects the HOME override so a clone's
 * synthetic .claude.json is found instead of the live one.
 *
 * Note: this deliberately keys off HOME (not CLAUDE_CONFIG_DIR), because
 * `.claude.json` lives in the user's home directory, not inside `.claude/`.
 */
export function resolveClaudeJsonPath(): string {
	return join(resolveHome(), ".claude.json");
}
