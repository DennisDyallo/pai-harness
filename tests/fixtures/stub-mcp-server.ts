#!/usr/bin/env bun
/**
 * Stub MCP server for testing the offline schema measurer.
 *
 * Speaks just enough JSON-RPC 2.0 over stdio to satisfy the handshake:
 *   initialize -> initialize result
 *   notifications/initialized -> (no response)
 *   tools/list -> a tools array
 *
 * Emits one log line to stdout first to prove the parser tolerates noise.
 */

const TOOLS = [
	{
		name: "echo",
		description: "Echo back the input text.",
		inputSchema: {
			type: "object",
			properties: { text: { type: "string" } },
			required: ["text"],
		},
	},
	{
		name: "add",
		description: "Add two numbers together.",
		inputSchema: {
			type: "object",
			properties: { a: { type: "number" }, b: { type: "number" } },
			required: ["a", "b"],
		},
	},
];

function send(msg: unknown) {
	process.stdout.write(`${JSON.stringify(msg)}\n`);
}

// Intentional non-JSON log noise to exercise the parser's tolerance.
process.stdout.write("[stub-mcp] starting up\n");

let buffer = "";
process.stdin.on("data", (chunk: Buffer) => {
	buffer += chunk.toString();
	let idx: number;
	// biome-ignore lint/suspicious/noAssignInExpressions: stream line splitting
	while ((idx = buffer.indexOf("\n")) !== -1) {
		const line = buffer.slice(0, idx).trim();
		buffer = buffer.slice(idx + 1);
		if (!line) continue;
		let msg: { id?: number | string; method?: string };
		try {
			msg = JSON.parse(line);
		} catch {
			continue;
		}
		if (msg.method === "initialize") {
			send({
				jsonrpc: "2.0",
				id: msg.id,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "stub-mcp", version: "1.0.0" },
				},
			});
		} else if (msg.method === "tools/list") {
			send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
			// Done — exit so the measurer's stdout collection completes.
			process.exit(0);
		}
		// notifications/initialized: no response
	}
});
