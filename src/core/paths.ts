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
