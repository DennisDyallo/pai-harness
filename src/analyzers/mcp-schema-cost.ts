/**
 * MCP Schema Cost — offline measurement of MCP/plugin tool schema sizes.
 *
 * For each configured MCP server, spawns the server as a subprocess and
 * performs the MCP handshake over stdio (JSON-RPC 2.0): `initialize` →
 * `notifications/initialized` → `tools/list`. The returned tools array is
 * serialized and its size measured in chars/tokens — this is what the model
 * pays for in context when the server's tools are exposed.
 *
 * HARD RULE: this NEVER launches `claude --bare` or spends any model/inference
 * budget. It only talks raw JSON-RPC to MCP server subprocesses over stdio.
 *
 * The framing/parsing layer is pure and unit-tested with a stub; the live
 * subprocess spawn is gated behind an explicit call so CI need not start real
 * servers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	resolveClaudeJsonPath,
	resolvePaiDir,
	resolveSettingsPath,
} from "../core/paths";
import type { McpSchemaCost } from "./context-assembly";

export type { McpSchemaCost };

const DEFAULT_TIMEOUT_MS = 15_000;

/** A configured MCP server: how to launch it. */
export interface McpServerConfig {
	name: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

/** A single JSON-RPC 2.0 message. */
export interface JsonRpcMessage {
	jsonrpc: "2.0";
	id?: number | string;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
}

/**
 * Read configured MCP servers from a `.claude.json` file (mcpServers block).
 * Defaults to the HOME-resolved `~/.claude.json` (honors the clone's HOME).
 */
export function readMcpServers(claudeJsonPath?: string): McpServerConfig[] {
	const path = claudeJsonPath ?? resolveClaudeJsonPath();
	if (!existsSync(path)) return [];
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		const servers = parsed.mcpServers;
		if (!servers || typeof servers !== "object") return [];
		const out: McpServerConfig[] = [];
		for (const [name, cfg] of Object.entries(
			servers as Record<string, Record<string, unknown>>,
		)) {
			if (!cfg || typeof cfg !== "object") continue;
			// HTTP/SSE transports have a `url` and no spawnable `command`. Surface
			// them with command "" so the measurer flags them remote-no-command
			// (unmeasured) rather than silently dropping them.
			const command = typeof cfg.command === "string" ? cfg.command : "";
			out.push({
				name,
				command,
				args: Array.isArray(cfg.args)
					? (cfg.args.filter((a) => typeof a === "string") as string[])
					: undefined,
				env:
					cfg.env && typeof cfg.env === "object"
						? (cfg.env as Record<string, string>)
						: undefined,
			});
		}
		return out;
	} catch {
		return [];
	}
}

/**
 * Read plugin names from plugins/installed_plugins.json (for reporting which
 * plugins are installed; plugin MCP servers are launched by Claude Code itself
 * and are not always directly spawnable here).
 */
export function readInstalledPlugins(paiDir?: string): string[] {
	const dir = paiDir ?? resolvePaiDir();
	const path = join(dir, "plugins", "installed_plugins.json");
	if (!existsSync(path)) return [];
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		if (parsed.plugins && typeof parsed.plugins === "object") {
			return Object.keys(parsed.plugins);
		}
		return [];
	} catch {
		return [];
	}
}

/**
 * One installed plugin, resolved from `plugins/installed_plugins.json`.
 * `key` is the manifest key (e.g. `context7@claude-plugins-official`);
 * `installPath` is the exact cache dir for the ACTIVE install (deterministic —
 * no directory-traversal guessing of which hash is current).
 */
export interface InstalledPlugin {
	key: string;
	name: string; // the part before `@`
	installPath: string;
}

/**
 * Resolve installed plugins (key + name + active installPath) from the manifest
 * `plugins/installed_plugins.json`. The manifest records the canonical install
 * path per plugin, so we never have to guess which cache hash is active.
 */
export function readInstalledPluginPaths(paiDir?: string): InstalledPlugin[] {
	const dir = paiDir ?? resolvePaiDir();
	const path = join(dir, "plugins", "installed_plugins.json");
	if (!existsSync(path)) return [];
	try {
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		const plugins = parsed.plugins;
		if (!plugins || typeof plugins !== "object") return [];
		const out: InstalledPlugin[] = [];
		for (const [key, entry] of Object.entries(
			plugins as Record<string, unknown>,
		)) {
			// Each value is an array of install records; take the first with an
			// installPath (manifest lists active install(s) for the key).
			const records = Array.isArray(entry) ? entry : [];
			const record = records.find(
				(r) =>
					r &&
					typeof r === "object" &&
					typeof (r as { installPath?: unknown }).installPath === "string",
			) as { installPath: string } | undefined;
			if (!record) continue;
			const name = key.split("@")[0];
			out.push({ key, name, installPath: record.installPath });
		}
		return out;
	} catch {
		return [];
	}
}

/**
 * Read plugin-provided MCP server definitions from the plugin cache.
 *
 * Plugin MCP servers are NOT in `.claude.json` — each installed plugin ships a
 * `.mcp.json` under its install path. We resolve each plugin's ACTIVE install
 * path from the manifest (`installed_plugins.json`) — NOT by directory-traversal
 * order — so version selection is deterministic.
 *
 * If `enabledPlugins` is provided (from the target config's settings.json), only
 * ENABLED plugins are read; disabled plugins are skipped entirely so their MCP
 * servers never appear in the measurement. This makes the budget honor the
 * toggle, not just manual gating.
 *
 * Two on-disk shapes are tolerated:
 *   1. flat: `{ "<name>": { command, args, ... } }`            (context7, playwright)
 *   2. wrapped: `{ "mcpServers": { "<name>": { ... } } }`       (atlassian)
 *
 * `type: "http"`/`"sse"` (remote/OAuth) servers have no `command` and are
 * returned with `command === ""` so callers record them unmeasured-remote.
 */
export function readPluginMcpServers(
	paiDir?: string,
	enabledPlugins?: Record<string, boolean>,
): McpServerConfig[] {
	const plugins = readInstalledPluginPaths(paiDir);
	const out: McpServerConfig[] = [];
	const seen = new Set<string>();

	for (const plugin of plugins) {
		// Honor the enabled toggle when an enabledPlugins map is supplied. A
		// plugin is enabled only if explicitly true (default-deny for safety —
		// an absent key means not enabled in that config).
		if (enabledPlugins && enabledPlugins[plugin.key] !== true) continue;

		const mcpJson = join(plugin.installPath, ".mcp.json");
		if (!existsSync(mcpJson)) continue;
		try {
			const parsed = JSON.parse(readFileSync(mcpJson, "utf-8")) as Record<
				string,
				unknown
			>;
			// Unwrap the optional mcpServers envelope.
			const block =
				parsed.mcpServers && typeof parsed.mcpServers === "object"
					? (parsed.mcpServers as Record<string, unknown>)
					: parsed;
			for (const [name, raw] of Object.entries(block)) {
				if (!raw || typeof raw !== "object") continue;
				if (seen.has(name)) continue;
				const cfg = raw as Record<string, unknown>;
				const command = typeof cfg.command === "string" ? cfg.command : ""; // "" => remote/no-spawn
				seen.add(name);
				out.push({
					name,
					command,
					args: Array.isArray(cfg.args)
						? (cfg.args.filter((a) => typeof a === "string") as string[])
						: undefined,
					env:
						cfg.env && typeof cfg.env === "object"
							? (cfg.env as Record<string, string>)
							: undefined,
				});
			}
		} catch {
			// Unreadable/malformed .mcp.json — skip it.
		}
	}
	return out;
}

/**
 * Read the `enabledPlugins` map from a settings.json file (the supported
 * plugin enable/disable toggle). Returns an empty object if absent/unreadable.
 */
export function readEnabledPlugins(
	settingsPath: string,
): Record<string, boolean> {
	if (!existsSync(settingsPath)) return {};
	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
		const ep = parsed.enabledPlugins;
		if (ep && typeof ep === "object") return ep as Record<string, boolean>;
		return {};
	} catch {
		return {};
	}
}

/**
 * Build the JSON-RPC request messages for the MCP tools/list handshake.
 * Pure — produces the exact wire messages a client must send.
 */
export function buildHandshakeRequests(): JsonRpcMessage[] {
	return [
		{
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "pai-harness-mcp-measurer", version: "1.0.0" },
			},
		},
		{
			jsonrpc: "2.0",
			method: "notifications/initialized",
		},
		{
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		},
	];
}

/**
 * Encode JSON-RPC messages for the MCP stdio transport.
 *
 * Per the MCP spec, stdio transport is NEWLINE-DELIMITED JSON-RPC: each message
 * is a single line and MUST NOT contain embedded newlines. (This is NOT LSP's
 * `Content-Length` header framing — that's a different protocol.)
 */
export function encodeMessages(messages: JsonRpcMessage[]): string {
	return `${messages.map((m) => JSON.stringify(m)).join("\n")}\n`;
}

/**
 * Parse newline-delimited JSON-RPC messages from a raw stdio buffer.
 * Tolerates blank lines and non-JSON noise (e.g. server log lines).
 */
export function parseMessages(raw: string): JsonRpcMessage[] {
	const out: JsonRpcMessage[] = [];
	for (const line of raw.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && parsed.jsonrpc === "2.0") {
				out.push(parsed as JsonRpcMessage);
			}
		} catch {
			// Non-JSON line (log noise) — skip
		}
	}
	return out;
}

/**
 * Extract the tools array from a parsed JSON-RPC response stream.
 * Looks for the response to the `tools/list` request (id === 2).
 * Returns an empty array if none found.
 */
export function extractToolsFromResponses(
	messages: JsonRpcMessage[],
): unknown[] {
	for (const msg of messages) {
		if (msg.id === 2 && msg.result && typeof msg.result === "object") {
			const tools = (msg.result as { tools?: unknown }).tools;
			if (Array.isArray(tools)) return tools;
		}
	}
	return [];
}

/**
 * Whether a VALID `tools/list` response (id 2, result.tools array) actually
 * arrived. Distinguishes "server answered with an empty toolset" (valid, rare)
 * from "server never answered" (failure) — the latter must NOT be counted as a
 * tiny real schema. An empty `[]` from extractToolsFromResponses is ambiguous
 * on its own; this function disambiguates.
 */
export function hasValidToolsListResponse(messages: JsonRpcMessage[]): boolean {
	for (const msg of messages) {
		if (msg.id === 2 && msg.result && typeof msg.result === "object") {
			const tools = (msg.result as { tools?: unknown }).tools;
			if (Array.isArray(tools)) return true;
		}
	}
	return false;
}

/**
 * Measure the serialized tool-schema cost from a raw stdio response buffer.
 * Pure — given the bytes a server emitted, compute the cost. This is the
 * unit-testable core (feed it a stub server's output).
 */
export function measureFromRawOutput(
	server: string,
	raw: string,
): McpSchemaCost {
	const messages = parseMessages(raw);
	const tools = extractToolsFromResponses(messages);
	const serialized = JSON.stringify(tools);
	return { server, chars: serialized.length, serialized };
}

/**
 * Build a MINIMAL scrubbed env for spawning an MCP server. The parent process
 * env is NOT inherited (it may hold real API keys); only PATH plus a few
 * isolation vars pass through, then the server's own (sanitized) env overlays.
 * This prevents leaking ambient secrets into spawned servers.
 */
export function scrubbedEnv(
	serverEnv?: Record<string, string>,
): Record<string, string> {
	const base: Record<string, string> = {};
	// PATH is required to locate the server binary; HOME/config dirs keep the
	// server pointed at the clone rather than the live user config.
	for (const key of ["PATH", "HOME", "PAI_DIR", "CLAUDE_CONFIG_DIR"]) {
		const val = process.env[key];
		if (val) base[key] = val;
	}
	return { ...base, ...serverEnv };
}

/**
 * Live: spawn an MCP server, perform the stdio handshake, and measure its
 * tool-schema cost. Resilient — a failed/timed-out server is recorded as
 * unmeasured (0 chars + error note) rather than throwing.
 *
 * GATED: only call this when you intend to spawn real subprocesses. NEVER
 * launches `claude --bare` and spends no inference budget. The server is
 * spawned with a scrubbed env (no inherited ambient secrets).
 */
export async function measureMcpServer(
	config: McpServerConfig,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<McpSchemaCost> {
	// Remote/HTTP/SSE servers (no spawnable command) cannot be measured offline.
	if (!config.command) {
		return {
			server: config.name,
			chars: 0,
			serialized: "[]",
			error: "remote-no-command (http/sse; requires auth, unmeasured)",
		};
	}
	try {
		const proc = Bun.spawn([config.command, ...(config.args ?? [])], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env: scrubbedEnv(config.env),
		});

		const payload = encodeMessages(buildHandshakeRequests());
		proc.stdin.write(payload);
		proc.stdin.end();

		const timeout = new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), timeoutMs),
		);
		// Drain BOTH stdout and stderr concurrently. Leaving stderr undrained can
		// deadlock a chatty server (it blocks writing to a full stderr pipe) and
		// also hides the failure reason.
		const collect = (async () => {
			const [out, err] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
			]);
			const exitCode = await proc.exited;
			return { out, err, exitCode };
		})();

		const result = await Promise.race([
			collect.then((c) => ({ kind: "done" as const, ...c })),
			timeout.then(() => ({ kind: "timeout" as const })),
		]);

		try {
			proc.kill();
		} catch {}

		if (result.kind === "timeout") {
			return {
				server: config.name,
				chars: 0,
				serialized: "[]",
				error: "timeout",
			};
		}

		// Validate the handshake actually completed: a real tools/list response
		// must have arrived. If it never did, record unmeasured-with-error — do
		// NOT count a missing response as a tiny ~2-char `[]` schema. (A valid
		// tools/list is authoritative even if the process later exits non-zero,
		// e.g. because we kill() it or it exits oddly after answering.)
		const messages = parseMessages(result.out);
		if (!hasValidToolsListResponse(messages)) {
			const stderrHint = result.err.trim().split("\n").slice(-3).join(" | ");
			return {
				server: config.name,
				chars: 0,
				serialized: "[]",
				error: `no tools/list response (exit ${result.exitCode})${
					stderrHint ? `: ${stderrHint}` : ""
				}`,
			};
		}

		return measureFromRawOutput(config.name, result.out);
	} catch (err) {
		return {
			server: config.name,
			chars: 0,
			serialized: "[]",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * Live: measure all configured MCP servers from a `.claude.json`.
 * GATED behind an explicit call (the CLI only invokes this with --live-mcp).
 */
export async function measureAllMcpServers(
	claudeJsonPath?: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<McpSchemaCost[]> {
	const servers = readMcpServers(claudeJsonPath);
	const results: McpSchemaCost[] = [];
	for (const server of servers) {
		results.push(await measureMcpServer(server, timeoutMs));
	}
	return results;
}

/**
 * Live: measure BOTH `.claude.json` mcpServers AND plugin-provided `.mcp.json`
 * servers, deduped by name (`.claude.json` wins on collision). npx-based plugin
 * servers (context7, playwright) need a longer fuse than local binaries, so a
 * generous default timeout applies here.
 *
 * Plugin servers are filtered by the target config's `enabledPlugins`
 * (settings.json): DISABLED plugins are not measured at all, so the result
 * reflects what the target would actually load — the tool honors the toggle, not
 * just manual gating. Pass `settingsPath` to point at a specific config (e.g. a
 * clone's settings.json); defaults to the resolved (HOME-aware) settings path.
 * Pass `includeDisabledPlugins: true` to measure every installed plugin
 * regardless of enabled state (e.g. to show a "before" baseline).
 *
 * GATED behind an explicit call. Never launches `claude --bare`; no inference.
 */
export async function measureAllServersIncludingPlugins(opts?: {
	claudeJsonPath?: string;
	paiDir?: string;
	settingsPath?: string;
	includeDisabledPlugins?: boolean;
	timeoutMs?: number;
}): Promise<McpSchemaCost[]> {
	const timeoutMs = opts?.timeoutMs ?? 60_000;
	const claudeServers = readMcpServers(opts?.claudeJsonPath);

	// Honor enabledPlugins from the target settings.json unless explicitly
	// including disabled plugins for a baseline.
	const enabled = opts?.includeDisabledPlugins
		? undefined
		: readEnabledPlugins(opts?.settingsPath ?? resolveSettingsPath());
	const pluginServers = readPluginMcpServers(opts?.paiDir, enabled);

	const byName = new Map<string, McpServerConfig>();
	for (const s of pluginServers) byName.set(s.name, s);
	for (const s of claudeServers) byName.set(s.name, s); // .claude.json overrides

	const results: McpSchemaCost[] = [];
	for (const server of byName.values()) {
		results.push(await measureMcpServer(server, timeoutMs));
	}
	return results;
}
