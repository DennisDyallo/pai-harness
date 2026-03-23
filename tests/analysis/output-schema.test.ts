import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createSandbox } from '../../src/core/sandbox';
import { runHook } from '../../src/core/runner';
import { validateHookOutput, isValidHookOutput } from '../../src/analyzers/output-validator';
import { makeSessionStartInput, makePreToolUseInput, makePostToolUseInput, makeStopInput, makeUserPromptInput } from '../../src/core/fixtures';
import type { HookInput } from '../../src/core/types';

describe('Output Schema Validation', () => {
  test('validates correct hook output', () => {
    const output = { continue: true };
    expect(isValidHookOutput(output)).toBe(true);
    expect(validateHookOutput(output)).toEqual([]);
  });

  test('rejects non-object output', () => {
    const errors = validateHookOutput('not an object');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].field).toBe('root');
  });

  test('rejects null output', () => {
    const errors = validateHookOutput(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('validates decision field', () => {
    expect(isValidHookOutput({ decision: 'allow' })).toBe(true);
    expect(isValidHookOutput({ decision: 'deny' })).toBe(true);
    expect(isValidHookOutput({ decision: 'invalid' })).toBe(false);
  });

  test('validates systemMessage field', () => {
    expect(isValidHookOutput({ systemMessage: 'hello' })).toBe(true);
    expect(isValidHookOutput({ systemMessage: 123 })).toBe(false);
  });

  test('validates hookSpecificOutput structure', () => {
    expect(isValidHookOutput({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'safe',
      }
    })).toBe(true);

    // Missing hookEventName
    const errors = validateHookOutput({
      hookSpecificOutput: { permissionDecision: 'allow' }
    });
    expect(errors.some(e => e.field.includes('hookEventName'))).toBe(true);
  });

  test('validates complex valid output', () => {
    const output = {
      continue: true,
      suppressOutput: false,
      systemMessage: 'Context loaded',
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: 'some context',
      },
    };
    expect(isValidHookOutput(output)).toBe(true);
  });

  test('catches multiple errors', () => {
    const output = {
      continue: 'yes', // should be boolean
      decision: 'maybe', // invalid
      systemMessage: 42, // should be string
    };
    const errors = validateHookOutput(output);
    expect(errors.length).toBe(3);
  });
});

describe('Hook Output Schema - Sandbox Execution', () => {
  const hooksDir = join(process.env.HOME ?? '', '.claude', 'hooks');

  test('SecurityValidator produces valid schema output', async () => {
    const hookPath = join(hooksDir, 'SecurityValidator.hook.ts');
    if (!existsSync(hookPath)) return; // skip if hook not present

    const sandbox = createSandbox();
    try {
      const input = makePreToolUseInput('Bash', { command: 'echo hello' });
      const result = await runHook({ hookPath, input, sandbox, timeoutMs: 10000 });
      if (result.parsedOutput) {
        const errors = validateHookOutput(result.parsedOutput);
        expect(errors).toEqual([]);
      }
      // Hook may exit with no output (allowed) or valid JSON
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    } finally {
      sandbox.cleanup();
    }
  });

  test('LoadContext produces valid schema output', async () => {
    const hookPath = join(hooksDir, 'LoadContext.hook.ts');
    if (!existsSync(hookPath)) return;

    const sandbox = createSandbox({
      seedFiles: {
        'CLAUDE.md': '# Test',
        'MEMORY.md': '# Memory',
      },
    });
    try {
      const input = makeSessionStartInput();
      const result = await runHook({ hookPath, input, sandbox, timeoutMs: 10000 });
      if (result.parsedOutput) {
        const errors = validateHookOutput(result.parsedOutput);
        expect(errors).toEqual([]);
      }
    } finally {
      sandbox.cleanup();
    }
  });
});
