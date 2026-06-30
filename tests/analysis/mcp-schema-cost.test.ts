import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildHandshakeRequests,
	encodeMessages,
	extractToolsFromResponses,
	hasValidToolsListResponse,
	measureFromRawOutput,
	measureMcpServer,
	parseMessages,
	readEnabledPlugins,
	readInstalledPluginPaths,
	readInstalledPlugins,
	readMcpServers,
	readPluginMcpServers,
	scrubbedEnv,
} from "../../src/analyzers/mcp-schema-cost";

const STUB = join(import.meta.dir, "../fixtures/stub-mcp-server.ts");
const STUB_BROKEN = join(
	import.meta.dir,
	"../fixtures/stub-mcp-server-broken.ts",
);

describe("JSON-RPC handshake framing", () => {
	test("builds initialize, initialized, tools/list", () => {
		const reqs = buildHandshakeRequests();
		expect(reqs[0].method).toBe("initialize");
		expect(reqs[0].id).toBe(1);
		expect(reqs[1].method).toBe("notifications/initialized");
		expect(reqs[1].id).toBeUndefined(); // notification has no id
		expect(reqs[2].method).toBe("tools/list");
		expect(reqs[2].id).toBe(2);
	});

	test("encodes messages as newline-delimited JSON", () => {
		const encoded = encodeMessages(buildHandshakeRequests());
		const lines = encoded.trim().split("\n");
		expect(lines).toHaveLength(3);
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});
});

describe("JSON-RPC parsing", () => {
	test("parses ndjson and skips non-JSON noise", () => {
		const raw = [
			"[stub] log line noise",
			'{"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
			"",
			"another log line",
			'{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}',
		].join("\n");
		const msgs = parseMessages(raw);
		expect(msgs).toHaveLength(2);
		expect(msgs[0].id).toBe(1);
		expect(msgs[1].id).toBe(2);
	});

	test("extracts tools array from the tools/list response (id 2)", () => {
		const msgs = parseMessages(
			'{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"x"}]}}',
		);
		const tools = extractToolsFromResponses(msgs);
		expect(tools).toEqual([{ name: "x" }]);
	});

	test("returns empty array when no tools/list response present", () => {
		const msgs = parseMessages('{"jsonrpc":"2.0","id":1,"result":{}}');
		expect(extractToolsFromResponses(msgs)).toEqual([]);
	});

	test("measureFromRawOutput counts serialized tool-schema chars", () => {
		const raw =
			'[stub] noise\n{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"echo","description":"Echo."}]}}';
		const cost = measureFromRawOutput("stub", raw);
		expect(cost.server).toBe("stub");
		expect(cost.chars).toBeGreaterThan(0);
		expect(cost.chars).toBe(cost.serialized.length);
		expect(JSON.parse(cost.serialized)).toHaveLength(1);
	});
});

describe("readMcpServers / readInstalledPlugins", () => {
	test("reads command-based mcpServers from a .claude.json", () => {
		const dir = join(tmpdir(), `mcp-cfg-${Date.now()}-${Math.random()}`);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, ".claude.json");
		writeFileSync(
			path,
			JSON.stringify({
				mcpServers: {
					stub: { command: "bun", args: [STUB] },
					httpOne: { url: "https://example.com/mcp" }, // surfaced, command ""
				},
			}),
		);
		const servers = readMcpServers(path);
		// Both entries surface now: command-based AND remote (the latter with an
		// empty command so the measurer flags it unmeasured rather than dropping it).
		expect(servers).toHaveLength(2);
		const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
		expect(byName.stub.command).toBe("bun");
		expect(byName.httpOne.command).toBe("");
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns empty for missing .claude.json", () => {
		expect(readMcpServers("/nonexistent/.claude.json")).toEqual([]);
	});

	test("reads installed plugin names", () => {
		const dir = join(tmpdir(), `plugins-${Date.now()}-${Math.random()}`);
		mkdirSync(join(dir, "plugins"), { recursive: true });
		writeFileSync(
			join(dir, "plugins", "installed_plugins.json"),
			JSON.stringify({ version: 2, plugins: { "a@x": [], "b@y": [] } }),
		);
		expect(readInstalledPlugins(dir).sort()).toEqual(["a@x", "b@y"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

/**
 * Build a fake PAI dir with a manifest (installed_plugins.json) whose
 * installPaths point at cache dirs holding .mcp.json files. Mirrors the real
 * layout the measurer now relies on (manifest-driven, not traversal-driven).
 */
function makePluginFixture(opts: {
	/** name -> { hash, mcp (object written to .mcp.json) } */
	plugins: Record<string, { hash: string; mcp: unknown }>;
	/** extra stale hashes per plugin that must NOT be selected */
	staleHashes?: Record<string, { hash: string; mcp: unknown }>;
}): string {
	const dir = join(tmpdir(), `plug-${Date.now()}-${Math.random()}`);
	const manifest: { version: number; plugins: Record<string, unknown[]> } = {
		version: 2,
		plugins: {},
	};
	const cacheRoot = join(dir, "plugins", "cache", "repo");
	for (const [name, { hash, mcp }] of Object.entries(opts.plugins)) {
		const installPath = join(cacheRoot, name, hash);
		mkdirSync(installPath, { recursive: true });
		writeFileSync(join(installPath, ".mcp.json"), JSON.stringify(mcp));
		manifest.plugins[`${name}@repo`] = [{ scope: "user", installPath }];
		// optionally drop a stale install with a DIFFERENT .mcp.json on disk that
		// the manifest does NOT point at — it must be ignored.
		const stale = opts.staleHashes?.[name];
		if (stale) {
			const stalePath = join(cacheRoot, name, stale.hash);
			mkdirSync(stalePath, { recursive: true });
			writeFileSync(join(stalePath, ".mcp.json"), JSON.stringify(stale.mcp));
		}
	}
	mkdirSync(join(dir, "plugins"), { recursive: true });
	writeFileSync(
		join(dir, "plugins", "installed_plugins.json"),
		JSON.stringify(manifest),
	);
	return dir;
}

describe("readInstalledPluginPaths — manifest-driven", () => {
	test("resolves key, name, and active installPath", () => {
		const dir = makePluginFixture({
			plugins: {
				context7: { hash: "h1", mcp: { context7: { command: "x" } } },
			},
		});
		const plugins = readInstalledPluginPaths(dir);
		expect(plugins).toHaveLength(1);
		expect(plugins[0].key).toBe("context7@repo");
		expect(plugins[0].name).toBe("context7");
		expect(plugins[0].installPath).toContain("/context7/h1");
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns empty for missing manifest", () => {
		expect(readInstalledPluginPaths("/nonexistent-pai-dir-xyz")).toEqual([]);
	});
});

describe("readPluginMcpServers — manifest-driven, enabled-aware", () => {
	test("reads flat and wrapped shapes; flags remote (no command)", () => {
		const dir = makePluginFixture({
			plugins: {
				context7: {
					hash: "h1",
					mcp: { context7: { command: "npx", args: ["-y", "x"] } },
				},
				atlassian: {
					hash: "h2",
					mcp: {
						mcpServers: { atlassian: { type: "http", url: "https://x/mcp" } },
					},
				},
			},
		});
		const servers = readPluginMcpServers(dir);
		const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
		expect(byName.context7.command).toBe("npx");
		expect(byName.context7.args).toEqual(["-y", "x"]);
		// remote server surfaces with empty command (caller records unmeasured)
		expect(byName.atlassian.command).toBe("");
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns empty when no manifest exists", () => {
		expect(readPluginMcpServers("/nonexistent-pai-dir-xyz")).toEqual([]);
	});

	test("selects active install from manifest — ignores stale hashes", () => {
		const dir = makePluginFixture({
			plugins: {
				atlassian: {
					hash: "active",
					mcp: { mcpServers: { atlassian: { command: "current" } } },
				},
			},
			// a stale dir on disk with a DIFFERENT command the manifest doesn't point to
			staleHashes: {
				atlassian: {
					hash: "stale",
					mcp: { mcpServers: { atlassian: { command: "OLD-SHOULD-NOT-WIN" } } },
				},
			},
		});
		const servers = readPluginMcpServers(dir);
		const atlassian = servers.find((s) => s.name === "atlassian");
		expect(atlassian?.command).toBe("current"); // deterministic, not traversal order
		rmSync(dir, { recursive: true, force: true });
	});

	test("HONORS enabledPlugins — disabled plugins are skipped", () => {
		const dir = makePluginFixture({
			plugins: {
				context7: { hash: "h1", mcp: { context7: { command: "npx" } } },
				playwright: { hash: "h2", mcp: { playwright: { command: "npx" } } },
			},
		});
		const enabled = {
			"context7@repo": false, // disabled -> must be skipped
			"playwright@repo": true, // enabled -> measured
		};
		const servers = readPluginMcpServers(dir, enabled);
		const names = servers.map((s) => s.name);
		expect(names).toContain("playwright");
		expect(names).not.toContain("context7");
		rmSync(dir, { recursive: true, force: true });
	});

	test("default-deny: plugin absent from enabledPlugins is treated as disabled", () => {
		const dir = makePluginFixture({
			plugins: {
				context7: { hash: "h1", mcp: { context7: { command: "npx" } } },
			},
		});
		const servers = readPluginMcpServers(dir, {}); // empty map
		expect(servers).toHaveLength(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("readEnabledPlugins — settings.json enabledPlugins", () => {
	test("reads the enabledPlugins map", () => {
		const dir = join(tmpdir(), `settings-${Date.now()}-${Math.random()}`);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, "settings.json");
		writeFileSync(
			path,
			JSON.stringify({ enabledPlugins: { "a@x": true, "b@y": false } }),
		);
		expect(readEnabledPlugins(path)).toEqual({ "a@x": true, "b@y": false });
		rmSync(dir, { recursive: true, force: true });
	});

	test("returns empty object for missing/invalid file", () => {
		expect(readEnabledPlugins("/nonexistent/settings.json")).toEqual({});
	});
});

describe("readMcpServers — surfaces user-level remote (http/sse) entries", () => {
	test("http entry surfaces with empty command (unmeasured remote), not dropped", () => {
		const dir = join(tmpdir(), `claudejson-${Date.now()}-${Math.random()}`);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, ".claude.json");
		writeFileSync(
			path,
			JSON.stringify({
				mcpServers: {
					local: { command: "bun", args: ["x"] },
					remoteOne: { type: "http", url: "https://example.com/mcp" },
				},
			}),
		);
		const servers = readMcpServers(path);
		const byName = Object.fromEntries(servers.map((s) => [s.name, s]));
		expect(byName.local.command).toBe("bun");
		expect(byName.remoteOne.command).toBe(""); // surfaced, not skipped
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("hasValidToolsListResponse", () => {
	test("true only when a tools/list (id 2) response with tools array arrived", () => {
		expect(
			hasValidToolsListResponse(
				parseMessages('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}'),
			),
		).toBe(true);
		expect(
			hasValidToolsListResponse(
				parseMessages('{"jsonrpc":"2.0","id":1,"result":{}}'),
			),
		).toBe(false);
		expect(hasValidToolsListResponse([])).toBe(false);
	});
});

describe("measureMcpServer — remote/no-command short-circuit", () => {
	test("records remote http server as unmeasured without spawning", async () => {
		const cost = await measureMcpServer(
			{ name: "atlassian", command: "" },
			500,
		);
		expect(cost.chars).toBe(0);
		expect(cost.error).toContain("remote-no-command");
	});
});

describe("measureMcpServer — failed spawn is unmeasured, not counted", () => {
	test("broken server (only stderr, exits 1, no tools/list) is flagged unmeasured", async () => {
		const cost = await measureMcpServer(
			{ name: "broken", command: "bun", args: [STUB_BROKEN] },
			10_000,
		);
		expect(cost.chars).toBe(0);
		expect(cost.error).toBeDefined();
		expect(cost.error).toContain("no tools/list response");
		// stderr was drained and surfaced in the error note
		expect(cost.error).toContain("missing API key");
	});
});

describe("scrubbedEnv — no inherited secrets", () => {
	test("does not inherit ambient secret-like env vars", () => {
		const prev = process.env.SOME_SECRET_API_KEY;
		process.env.SOME_SECRET_API_KEY = "live-secret-should-not-leak";
		try {
			const env = scrubbedEnv();
			expect(env.SOME_SECRET_API_KEY).toBeUndefined();
			// PATH passes through so the binary can be located.
			expect(env.PATH).toBeDefined();
		} finally {
			if (prev === undefined) delete process.env.SOME_SECRET_API_KEY;
			else process.env.SOME_SECRET_API_KEY = prev;
		}
	});

	test("overlays the server's own (sanitized) env", () => {
		const env = scrubbedEnv({ SERVER_FLAG: "1" });
		expect(env.SERVER_FLAG).toBe("1");
	});
});

describe("live spawn against stub server (no claude --bare, no inference)", () => {
	test("measures the stub MCP server's tool schemas over stdio", async () => {
		const cost = await measureMcpServer(
			{ name: "stub", command: "bun", args: [STUB] },
			10_000,
		);
		expect(cost.error).toBeUndefined();
		expect(cost.chars).toBeGreaterThan(0);
		const tools = JSON.parse(cost.serialized);
		expect(tools).toHaveLength(2);
		expect(tools.map((t: { name: string }) => t.name).sort()).toEqual([
			"add",
			"echo",
		]);
	});

	test("records a failed server as unmeasured rather than throwing", async () => {
		const cost = await measureMcpServer(
			{ name: "broken", command: "this-command-does-not-exist-xyz" },
			3000,
		);
		expect(cost.chars).toBe(0);
		expect(cost.error).toBeDefined();
	});
});
