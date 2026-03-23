/**
 * Context Assembly — simulate what gets injected at SessionStart
 *
 * Collects CLAUDE.md, loadAtStartup files, LoadContext hook output,
 * and MEMORY.md to show the full context picture.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function expandPath(p: string): string {
  const home = homedir();
  return p
    .replace(/^\$HOME(?=\/|$)/, home)
    .replace(/^\$\{HOME\}(?=\/|$)/, home)
    .replace(/^~(?=\/|$)/, home);
}

export interface ContextPiece {
  source: string;
  content: string;
  chars: number;
}

export function assembleContext(paiDir?: string): ContextPiece[] {
  const dir = paiDir ?? process.env.PAI_DIR ?? join(process.env.HOME ?? '', '.claude');
  const pieces: ContextPiece[] = [];

  // 1. CLAUDE.md
  const claudeMd = join(dir, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    const content = readFileSync(claudeMd, 'utf-8');
    pieces.push({ source: 'CLAUDE.md', content, chars: content.length });
  }

  // 2. loadAtStartup files from settings.json
  const settingsPath = join(dir, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.loadAtStartup && Array.isArray(settings.loadAtStartup)) {
        for (const filePath of settings.loadAtStartup) {
          const resolved = expandPath(filePath);
          if (existsSync(resolved)) {
            const content = readFileSync(resolved, 'utf-8');
            pieces.push({ source: `loadAtStartup: ${filePath}`, content, chars: content.length });
          }
        }
      }
    } catch {}
  }

  // 3. MEMORY.md (first 200 lines)
  const memoryMd = join(dir, 'MEMORY.md');
  if (existsSync(memoryMd)) {
    const full = readFileSync(memoryMd, 'utf-8');
    const lines = full.split('\n');
    const content = lines.slice(0, 200).join('\n');
    pieces.push({
      source: `MEMORY.md (${Math.min(lines.length, 200)}/${lines.length} lines)`,
      content,
      chars: content.length,
    });
  }

  return pieces;
}

export async function assembleContextWithHook(paiDir?: string, hookPath?: string): Promise<ContextPiece[]> {
  const dir = paiDir ?? process.env.PAI_DIR ?? join(process.env.HOME ?? '', '.claude');
  const pieces = assembleContext(dir);

  // 4. Run LoadContext hook in sandbox and capture stdout
  const loadContextPath = hookPath ?? join(dir, 'hooks', 'LoadContext.hook.ts');
  if (existsSync(loadContextPath)) {
    try {
      const proc = Bun.spawn(['bun', loadContextPath], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          PAI_DIR: dir,
          CLAUDE_CONFIG_DIR: dir,
        } as Record<string, string>,
      });

      const input = JSON.stringify({
        session_id: `context-assembly-${Date.now()}`,
        hook_event_name: 'SessionStart',
      });
      proc.stdin.write(input);
      proc.stdin.end();

      const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000));
      const result = await Promise.race([proc.exited.then(() => 'done' as const), timeout]);

      if (result === 'done') {
        const stdout = await new Response(proc.stdout).text();
        if (stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout.trim());
            const hookContent = parsed.systemMessage ?? stdout.trim();
            pieces.push({
              source: 'LoadContext hook (systemMessage)',
              content: hookContent,
              chars: hookContent.length,
            });
          } catch {
            pieces.push({
              source: 'LoadContext hook (raw)',
              content: stdout.trim(),
              chars: stdout.trim().length,
            });
          }
        }
      }
    } catch (err) {
      pieces.push({
        source: 'LoadContext hook (error)',
        content: `Hook failed: ${err instanceof Error ? err.message : String(err)}`,
        chars: 0,
      });
    }
  }

  return pieces;
}
