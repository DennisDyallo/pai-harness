import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSandbox } from '../../src/core/sandbox';
import { runHook } from '../../src/core/runner';
import { makeStopInput, makeUserPromptInput } from '../../src/core/fixtures';
import type { Sandbox } from '../../src/core/types';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const HOME = process.env.HOME!;
const LAST_RESPONSE_HOOK = join(HOME, '.claude/hooks/LastResponseCache.hook.ts');
const RATING_CAPTURE_HOOK = join(HOME, '.claude/hooks/RatingCapture.hook.ts');

describe('Rating Flow: LastResponseCache → RatingCapture', () => {
  let sandbox: Sandbox;

  beforeEach(() => {
    // Create mock inference response file inside sandbox
    sandbox = createSandbox({
      seedFiles: {
        'mock-inference-response.json': JSON.stringify({
          rating: null,
          sentiment: 'neutral',
          confidence: 0.3,
          summary: 'Neutral command',
          detailed_context: '',
        }),
      },
    });
    // Point inference mock to sandbox file
    sandbox.env.PAI_INFERENCE_MOCK = join(sandbox.dir, 'mock-inference-response.json');
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  it('should write last-response.txt via LastResponseCache', async () => {
    const message = 'I refactored the auth module to use JWT tokens.';
    const input = makeStopInput(message);
    const result = await runHook({ hookPath: LAST_RESPONSE_HOOK, input, sandbox });

    expect(result.exitCode).toBe(0);

    const cachePath = join(sandbox.dir, 'MEMORY', 'STATE', 'last-response.txt');
    expect(existsSync(cachePath)).toBe(true);
    expect(readFileSync(cachePath, 'utf-8')).toBe(message);
  });

  it('should capture explicit rating "8 - great work" to ratings.jsonl', async () => {
    // Step 1: Seed the last response cache (simulates Stop event)
    const message = 'Implemented the new feature successfully.';
    const stopInput = makeStopInput(message);
    await runHook({ hookPath: LAST_RESPONSE_HOOK, input: stopInput, sandbox });

    // Step 2: Run RatingCapture with explicit rating
    const ratingInput = makeUserPromptInput('8 - great work');
    const result = await runHook({
      hookPath: RATING_CAPTURE_HOOK,
      input: ratingInput,
      sandbox,
      timeoutMs: 10000,
    });

    expect(result.exitCode).toBe(0);

    // Verify ratings.jsonl was created
    const ratingsPath = join(sandbox.dir, 'MEMORY', 'LEARNING', 'SIGNALS', 'ratings.jsonl');
    expect(existsSync(ratingsPath)).toBe(true);

    const lines = readFileSync(ratingsPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.rating).toBe(8);
    expect(entry.source).toBe('explicit');
    expect(entry.comment).toBe('great work');
  });

  it('should capture low explicit rating "2 - terrible" and create learning file', async () => {
    // Step 1: Seed last response cache
    const message = 'I deleted the wrong files by accident.';
    const stopInput = makeStopInput(message);
    await runHook({ hookPath: LAST_RESPONSE_HOOK, input: stopInput, sandbox });

    // Step 2: Run RatingCapture with low rating
    const ratingInput = makeUserPromptInput('2 - terrible');
    const result = await runHook({
      hookPath: RATING_CAPTURE_HOOK,
      input: ratingInput,
      sandbox,
      timeoutMs: 10000,
    });

    expect(result.exitCode).toBe(0);

    // Verify ratings.jsonl entry
    const ratingsPath = join(sandbox.dir, 'MEMORY', 'LEARNING', 'SIGNALS', 'ratings.jsonl');
    expect(existsSync(ratingsPath)).toBe(true);

    const lines = readFileSync(ratingsPath, 'utf-8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    expect(entry.rating).toBe(2);
    expect(entry.source).toBe('explicit');

    // Verify a learning file was created for the low rating
    // Learning files go to MEMORY/LEARNING/<category>/<YYYY-MM>/
    const learningBase = join(sandbox.dir, 'MEMORY', 'LEARNING');
    const categories = ['SYSTEM', 'ALGORITHM', 'FAILURES'];
    let foundLearningFile = false;

    for (const cat of categories) {
      const catDir = join(learningBase, cat);
      if (!existsSync(catDir)) continue;
      // Walk subdirs (YYYY-MM folders)
      const { readdirSync } = await import('fs');
      for (const sub of readdirSync(catDir, { withFileTypes: true })) {
        if (sub.isDirectory()) {
          const files = readdirSync(join(catDir, sub.name));
          if (files.some((f: string) => f.includes('LEARNING') && f.includes('low-rating'))) {
            foundLearningFile = true;
          }
        }
      }
    }

    expect(foundLearningFile).toBe(true);
  });

  it('should handle explicit rating without prior response cache', async () => {
    // Run RatingCapture directly (no Stop event first)
    const ratingInput = makeUserPromptInput('7 - decent');
    const result = await runHook({
      hookPath: RATING_CAPTURE_HOOK,
      input: ratingInput,
      sandbox,
      timeoutMs: 10000,
    });

    expect(result.exitCode).toBe(0);

    const ratingsPath = join(sandbox.dir, 'MEMORY', 'LEARNING', 'SIGNALS', 'ratings.jsonl');
    expect(existsSync(ratingsPath)).toBe(true);

    const entry = JSON.parse(readFileSync(ratingsPath, 'utf-8').trim().split('\n')[0]);
    expect(entry.rating).toBe(7);
    // No response_preview since no cache existed
  });
});
