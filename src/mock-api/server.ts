/**
 * Mock Anthropic Messages API Server — Bun.serve HTTP server
 * Returns responses from loaded scenario files, logs requests to JSONL.
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// --- Types ---

export interface ScenarioResponse {
  match: string;
  text: string;
  tool_use?: { name: string; input: Record<string, unknown> };
}

export interface Scenario {
  name: string;
  responses?: ScenarioResponse[];
  error?: { type: string; message: string };
  status?: number;
}

export interface MockServer {
  url: string;
  port: number;
  requestLog: CapturedRequest[];
  server: ReturnType<typeof Bun.serve>;
}

export interface CapturedRequest {
  timestamp: string;
  method: string;
  path: string;
  body: unknown;
  responseStatus: number;
}

export interface MockServerOptions {
  port?: number;
  scenario?: string;
  logPath?: string;
}

// --- Scenario Loading ---

const SCENARIOS_DIR = resolve(import.meta.dir, 'scenarios');

function loadScenario(name: string): Scenario {
  const filePath = join(SCENARIOS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Scenario not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

// --- Response Builders ---

function generateId(): string {
  return `msg_test_${Date.now().toString(36)}`;
}

function buildMessageResponse(text: string, toolUse?: ScenarioResponse['tool_use']): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];

  if (text) {
    content.push({ type: 'text', text });
  }

  if (toolUse) {
    content.push({
      type: 'tool_use',
      id: `toolu_test_${Date.now().toString(36)}`,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  return {
    id: generateId(),
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-opus-4-6',
    stop_reason: toolUse ? 'tool_use' : 'end_turn',
    usage: { input_tokens: 10, output_tokens: Math.ceil((text?.length ?? 0) / 4) },
  };
}

function buildSSEStream(text: string, toolUse?: ScenarioResponse['tool_use']): string {
  const msgId = generateId();
  const lines: string[] = [];

  // message_start
  lines.push('event: message_start');
  lines.push(`data: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-opus-4-6',
      stop_reason: null,
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  })}`);
  lines.push('');

  // text content block
  if (text) {
    lines.push('event: content_block_start');
    lines.push(`data: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}`);
    lines.push('');

    lines.push('event: content_block_delta');
    lines.push(`data: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })}`);
    lines.push('');

    lines.push('event: content_block_stop');
    lines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}`);
    lines.push('');
  }

  // tool_use content block
  if (toolUse) {
    const toolIndex = text ? 1 : 0;
    lines.push('event: content_block_start');
    lines.push(`data: ${JSON.stringify({
      type: 'content_block_start',
      index: toolIndex,
      content_block: {
        type: 'tool_use',
        id: `toolu_test_${Date.now().toString(36)}`,
        name: toolUse.name,
        input: {},
      },
    })}`);
    lines.push('');

    lines.push('event: content_block_delta');
    lines.push(`data: ${JSON.stringify({
      type: 'content_block_delta',
      index: toolIndex,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolUse.input) },
    })}`);
    lines.push('');

    lines.push('event: content_block_stop');
    lines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: toolIndex })}`);
    lines.push('');
  }

  // message_delta + message_stop
  const outputTokens = Math.ceil((text?.length ?? 0) / 4);
  lines.push('event: message_delta');
  lines.push(`data: ${JSON.stringify({
    type: 'message_delta',
    delta: { stop_reason: toolUse ? 'tool_use' : 'end_turn' },
    usage: { output_tokens: outputTokens },
  })}`);
  lines.push('');

  lines.push('event: message_stop');
  lines.push(`data: ${JSON.stringify({ type: 'message_stop' })}`);
  lines.push('');

  return lines.join('\n');
}

function findMatchingResponse(scenario: Scenario, body: Record<string, unknown>): ScenarioResponse | null {
  if (!scenario.responses) return null;

  const messages = body.messages as Array<{ content: string }> | undefined;
  const lastMessage = messages?.[messages.length - 1]?.content ?? '';
  const searchText = typeof lastMessage === 'string' ? lastMessage : JSON.stringify(lastMessage);

  for (const resp of scenario.responses) {
    if (new RegExp(resp.match).test(searchText)) {
      return resp;
    }
  }
  return null;
}

// --- Server ---

export function startMockServer(options: MockServerOptions = {}): MockServer {
  const port = options.port ?? 8787;
  const scenarioName = options.scenario ?? 'basic-session';
  const logPath = options.logPath;
  const scenario = loadScenario(scenarioName);
  const requestLog: CapturedRequest[] = [];

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);

      // Health check
      if (req.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', scenario: scenario.name }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      // Messages endpoint
      if (req.method === 'POST' && url.pathname === '/v1/messages') {
        return handleMessages(req, scenario, requestLog, logPath);
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return {
    url: `http://localhost:${port}`,
    port,
    requestLog,
    server,
  };
}

async function handleMessages(
  req: Request,
  scenario: Scenario,
  requestLog: CapturedRequest[],
  logPath?: string,
): Promise<Response> {
  const body = await req.json() as Record<string, unknown>;
  const isStreaming = body.stream === true;

  // Error scenario
  if (scenario.error) {
    const status = scenario.status ?? 500;
    const captured: CapturedRequest = {
      timestamp: new Date().toISOString(),
      method: 'POST',
      path: '/v1/messages',
      body,
      responseStatus: status,
    };
    requestLog.push(captured);
    if (logPath) appendFileSync(logPath, JSON.stringify(captured) + '\n');

    return new Response(JSON.stringify({
      type: 'error',
      error: scenario.error,
    }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Find matching response
  const matched = findMatchingResponse(scenario, body);
  const text = matched?.text ?? 'No matching response in scenario.';
  const toolUse = matched?.tool_use;

  const captured: CapturedRequest = {
    timestamp: new Date().toISOString(),
    method: 'POST',
    path: '/v1/messages',
    body,
    responseStatus: 200,
  };
  requestLog.push(captured);
  if (logPath) appendFileSync(logPath, JSON.stringify(captured) + '\n');

  if (isStreaming) {
    const sseData = buildSSEStream(text, toolUse);
    return new Response(sseData, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      },
    });
  }

  return new Response(JSON.stringify(buildMessageResponse(text, toolUse)), {
    headers: { 'content-type': 'application/json' },
  });
}

export function stopMockServer(server: MockServer): void {
  server.server.stop(true);
}
