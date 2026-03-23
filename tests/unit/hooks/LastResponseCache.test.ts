import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSandbox } from '../../../src/core/sandbox';
import { runHook } from '../../../src/core/runner';
import { makeStopInput } from '../../../src/core/fixtures';
import type { Sandbox } from '../../../src/core/types';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/LastResponseCache.hook.ts`;

describe('LastResponseCache', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('should write last-response.txt when given a valid Stop input', async () => {
    const message = 'Here is the completed implementation of the auth system.';
    const input = makeStopInput(message);
    const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

    expect(result.exitCode).toBe(0);

    // Verify last-response.txt was written in the sandbox
    const cachePath = join(sandbox.dir, 'MEMORY', 'STATE', 'last-response.txt');
    expect(existsSync(cachePath)).toBe(true);

    const content = readFileSync(cachePath, 'utf-8');
    expect(content).toBe(message);
  });

  it('should truncate responses longer than 2000 chars', async () => {
    const longMessage = 'x'.repeat(3000);
    const input = makeStopInput(longMessage);
    const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

    expect(result.exitCode).toBe(0);

    const cachePath = join(sandbox.dir, 'MEMORY', 'STATE', 'last-response.txt');
    expect(existsSync(cachePath)).toBe(true);

    const content = readFileSync(cachePath, 'utf-8');
    expect(content.length).toBe(2000);
  });

  it('should exit 0 with empty last_assistant_message', async () => {
    const input = makeStopInput('');
    const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

    expect(result.exitCode).toBe(0);

    // No file should be written when message is empty
    const cachePath = join(sandbox.dir, 'MEMORY', 'STATE', 'last-response.txt');
    expect(existsSync(cachePath)).toBe(false);
  });

  it('should complete within 500ms', async () => {
    const input = makeStopInput('Quick response');
    const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

    expect(result.durationMs).toBeLessThan(500);
  });
});
