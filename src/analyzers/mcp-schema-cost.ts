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
import { resolveClaudeJsonPath, resolvePaiDir } from "../core/paths";
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
			const command = cfg.command;
			if (typeof command !== "string") continue; // skip url/http transports
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
		const collect = (async () => {
			const text = await new Response(proc.stdout).text();
			return text;
		})();

		const result = await Promise.race([
			collect.then((t) => ({ kind: "done" as const, text: t })),
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

		return measureFromRawOutput(config.name, result.text);
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
