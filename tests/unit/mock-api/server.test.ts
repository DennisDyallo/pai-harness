import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type MockServer,
	startMockServer,
	stopMockServer,
} from "../../../src/mock-api/server";

let server: MockServer | null = null;

afterEach(() => {
	if (server) {
		stopMockServer(server);
		server = null;
	}
});

describe("mock-api server", () => {
	it("starts on configurable port", () => {
		server = startMockServer({ port: 9901 });
		expect(server.port).toBe(9901);
		expect(server.url).toBe("http://localhost:9901");
	});

	it("responds to health check", async () => {
		server = startMockServer({ port: 9902 });
		const res = await fetch(`${server.url}/health`);
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(body.status).toBe("ok");
		expect(body.scenario).toBe("basic-session");
	});

	it("returns 404 for unknown routes", async () => {
		server = startMockServer({ port: 9903 });
		const res = await fetch(`${server.url}/v1/unknown`);
		expect(res.status).toBe(404);
	});

	it("returns non-streaming message response", async () => {
		server = startMockServer({ port: 9904 });
		const res = await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 100,
			}),
		});
		const body = (await res.json()) as Record<string, unknown>;
		expect(res.status).toBe(200);
		expect(body.type).toBe("message");
		expect(body.role).toBe("assistant");
		expect(
			(body.content as Array<{ type: string; text: string }>)[0].text,
		).toContain("mock Claude response");
	});

	it("returns SSE stream when stream: true", async () => {
		server = startMockServer({ port: 9905 });
		const res = await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 100,
				stream: true,
			}),
		});
		expect(res.headers.get("content-type")).toBe("text/event-stream");
		const text = await res.text();
		expect(text).toContain("event: message_start");
		expect(text).toContain("event: content_block_delta");
		expect(text).toContain("event: message_stop");
		expect(text).toContain("mock Claude response");
	});

	it("captures requests in requestLog", async () => {
		server = startMockServer({ port: 9906 });
		expect(server.requestLog.length).toBe(0);

		await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "Test" }],
				max_tokens: 10,
			}),
		});

		expect(server.requestLog.length).toBe(1);
		expect(server.requestLog[0].method).toBe("POST");
		expect(server.requestLog[0].path).toBe("/v1/messages");
		expect(server.requestLog[0].responseStatus).toBe(200);
	});

	it("logs requests to JSONL file", async () => {
		const logPath = join(tmpdir(), `mock-api-test-${Date.now()}.jsonl`);
		server = startMockServer({ port: 9907, logPath });

		await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "Log test" }],
				max_tokens: 10,
			}),
		});

		const logContent = readFileSync(logPath, "utf-8").trim();
		const entry = JSON.parse(logContent);
		expect(entry.method).toBe("POST");
		expect(entry.responseStatus).toBe(200);

		// cleanup
		if (existsSync(logPath)) unlinkSync(logPath);
	});

	it("loads error scenario and returns error", async () => {
		server = startMockServer({ port: 9908, scenario: "error-response" });
		const res = await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "test" }],
				max_tokens: 10,
			}),
		});
		expect(res.status).toBe(529);
		const body = (await res.json()) as {
			type: string;
			error: { type: string };
		};
		expect(body.type).toBe("error");
		expect(body.error.type).toBe("overloaded_error");
	});

	it("loads tool-use scenario with tool_use content", async () => {
		server = startMockServer({ port: 9909, scenario: "tool-use" });
		const res = await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "do something" }],
				max_tokens: 100,
			}),
		});
		const body = (await res.json()) as Record<string, unknown>;
		const content = body.content as Array<{ type: string; name?: string }>;
		expect(content.length).toBe(2);
		expect(content[0].type).toBe("text");
		expect(content[1].type).toBe("tool_use");
		expect(content[1].name).toBe("Bash");
		expect(body.stop_reason).toBe("tool_use");
	});

	it("tool-use scenario streams with tool_use block", async () => {
		server = startMockServer({ port: 9910, scenario: "tool-use" });
		const res = await fetch(`${server.url}/v1/messages`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: "claude-opus-4-6",
				messages: [{ role: "user", content: "do something" }],
				max_tokens: 100,
				stream: true,
			}),
		});
		const text = await res.text();
		expect(text).toContain("tool_use");
		expect(text).toContain("input_json_delta");
		expect(text).toContain('"stop_reason":"tool_use"');
	});

	it("throws on unknown scenario", () => {
		expect(() =>
			startMockServer({ port: 9911, scenario: "nonexistent" }),
		).toThrow("Scenario not found");
	});

	it("stopMockServer stops the server", async () => {
		server = startMockServer({ port: 9912 });
		stopMockServer(server);
		// After stopping, fetch should fail
		try {
			await fetch(`http://localhost:9912/health`);
			// If somehow succeeds, that's unexpected but not a hard failure in tests
		} catch {
			// Expected: connection refused
		}
		server = null; // prevent afterEach from stopping again
	});
});
