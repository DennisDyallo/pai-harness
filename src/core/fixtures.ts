/**
 * Fixtures — factory functions for hook input payloads
 */

import type { HookInput } from './types';

function makeSessionId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makePreToolUseInput(
  toolName: string,
  toolInput: Record<string, unknown> | string = {},
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    ...overrides,
  };
}

export function makePostToolUseInput(
  toolName: string,
  toolInput: Record<string, unknown> | string = {},
  toolOutput: string = '',
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: toolInput,
    tool_output: toolOutput,
    ...overrides,
  };
}

export function makeSessionStartInput(
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'SessionStart',
    ...overrides,
  };
}

export function makeSessionEndInput(
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'SessionEnd',
    transcript_path: '/tmp/test-transcript.jsonl',
    ...overrides,
  };
}

export function makeUserPromptInput(
  prompt: string,
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'UserPromptSubmit',
    user_prompt: prompt,
    ...overrides,
  };
}

export function makeStopInput(
  lastMessage: string = '',
  overrides: Partial<HookInput> = {}
): HookInput {
  return {
    session_id: makeSessionId(),
    hook_event_name: 'Stop',
    transcript_path: '/tmp/test-transcript.jsonl',
    last_assistant_message: lastMessage,
    ...overrides,
  };
}
