import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectDrift } from '../../src/sync/drift-detector';

describe('Drift Detector', () => {
  let sourceDir: string;
  let liveDir: string;

  beforeEach(() => {
    const base = join(tmpdir(), `drift-test-${Date.now()}`);
    sourceDir = join(base, 'source');
    liveDir = join(base, 'live');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(liveDir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(sourceDir.replace('/source', ''), { recursive: true, force: true }); } catch {}
  });

  test('reports no drift when dirs are identical', () => {
    writeFileSync(join(sourceDir, 'A.hook.ts'), 'const a = 1;');
    writeFileSync(join(liveDir, 'A.hook.ts'), 'const a = 1;');

    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(false);
    expect(report.identical).toEqual(['A.hook.ts']);
    expect(report.modified).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
  });

  test('detects modified files', () => {
    writeFileSync(join(sourceDir, 'A.hook.ts'), 'const a = 1;');
    writeFileSync(join(liveDir, 'A.hook.ts'), 'const a = 2;');

    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(true);
    expect(report.modified).toEqual(['A.hook.ts']);
  });

  test('detects live-only files (added)', () => {
    writeFileSync(join(liveDir, 'Extra.hook.ts'), 'const x = 1;');

    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(true);
    expect(report.added).toEqual(['Extra.hook.ts']);
  });

  test('detects source-only files (removed from live)', () => {
    writeFileSync(join(sourceDir, 'Missing.hook.ts'), 'const x = 1;');

    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(true);
    expect(report.removed).toEqual(['Missing.hook.ts']);
  });

  test('handles mixed drift scenario', () => {
    writeFileSync(join(sourceDir, 'Same.hook.ts'), 'same');
    writeFileSync(join(liveDir, 'Same.hook.ts'), 'same');
    writeFileSync(join(sourceDir, 'Changed.hook.ts'), 'v1');
    writeFileSync(join(liveDir, 'Changed.hook.ts'), 'v2');
    writeFileSync(join(sourceDir, 'Gone.hook.ts'), 'gone');
    writeFileSync(join(liveDir, 'New.hook.ts'), 'new');

    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(true);
    expect(report.identical).toContain('Same.hook.ts');
    expect(report.modified).toContain('Changed.hook.ts');
    expect(report.removed).toContain('Gone.hook.ts');
    expect(report.added).toContain('New.hook.ts');
    expect(report.files.length).toBe(4);
  });

  test('handles empty directories', () => {
    const report = detectDrift(sourceDir, liveDir);
    expect(report.hasDrift).toBe(false);
    expect(report.files).toEqual([]);
  });

  test('handles non-existent directories', () => {
    const report = detectDrift('/nonexistent/source', '/nonexistent/live');
    expect(report.hasDrift).toBe(false);
  });
});
