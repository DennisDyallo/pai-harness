import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildHandshakeRequests,
	encodeMessages,
	extractToolsFromResponses,
	measureFromRawOutput,
	measureMcpServer,
	parseMessages,
	readInstalledPlugins,
	readMcpServers,
	scrubbedEnv,
} from "../../src/analyzers/mcp-schema-cost";

const STUB = join(import.meta.dir, "../fixtures/stub-mcp-server.ts");

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
					httpOne: { url: "https://example.com/mcp" }, // skipped (no command)
				},
			}),
		);
		const servers = readMcpServers(path);
		expect(servers).toHaveLength(1);
		expect(servers[0].name).toBe("stub");
		expect(servers[0].command).toBe("bun");
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
