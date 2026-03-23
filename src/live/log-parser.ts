/**
 * Log Parser — parse Claude Code JSONL session logs from ~/.claude/projects/
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

export interface SessionSummary {
  id: string;
  path: string;
  date: Date;
  sizeBytes: number;
}

export interface ParsedEntry {
  type: string;
  timestamp: string;
  content: unknown;
}

export interface HookEntry extends ParsedEntry {
  type: 'hook';
  hookName: string;
  event: string;
}

export interface ErrorEntry extends ParsedEntry {
  type: 'error';
  message: string;
}

export function listSessions(projectDir?: string): SessionSummary[] {
  const baseDir = projectDir ?? join(homedir(), '.claude', 'projects');
  if (!existsSync(baseDir)) return [];

  const sessions: SessionSummary[] = [];

  function walkForJsonl(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkForJsonl(fullPath);
      } else if (entry.name.endsWith('.jsonl')) {
        const stat = statSync(fullPath);
        sessions.push({
          id: basename(entry.name, '.jsonl'),
          path: fullPath,
          date: stat.mtime,
          sizeBytes: stat.size,
        });
      }
    }
  }

  walkForJsonl(baseDir);
  sessions.sort((a, b) => b.date.getTime() - a.date.getTime());
  return sessions;
}

export function parseSession(sessionPath: string): ParsedEntry[] {
  if (!existsSync(sessionPath)) return [];

  const content = readFileSync(sessionPath, 'utf-8');
  const entries: ParsedEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      entries.push({
        type: parsed.type ?? 'unknown',
        timestamp: parsed.timestamp ?? parsed.ts ?? '',
        content: parsed,
      });
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

export function filterHookEntries(entries: ParsedEntry[]): HookEntry[] {
  return entries
    .filter((e) => {
      const c = e.content as Record<string, unknown>;
      return (
        e.type === 'hook' ||
        c.hook !== undefined ||
        c.hook_event_name !== undefined ||
        (typeof c.type === 'string' && c.type.toLowerCase().includes('hook'))
      );
    })
    .map((e) => {
      const c = e.content as Record<string, unknown>;
      return {
        ...e,
        type: 'hook' as const,
        hookName: (c.hook as string) ?? (c.hookName as string) ?? '',
        event: (c.hook_event_name as string) ?? (c.event as string) ?? '',
      };
    });
}

export function filterErrors(entries: ParsedEntry[]): ErrorEntry[] {
  return entries
    .filter((e) => {
      const c = e.content as Record<string, unknown>;
      return (
        e.type === 'error' ||
        c.error !== undefined ||
        (typeof c.type === 'string' && c.type.toLowerCase().includes('error')) ||
        (typeof c.type === 'string' && c.type.toLowerCase().includes('failure'))
      );
    })
    .map((e) => {
      const c = e.content as Record<string, unknown>;
      return {
        ...e,
        type: 'error' as const,
        message:
          (c.error as string) ??
          (c.message as string) ??
          (c.reason as string) ??
          JSON.stringify(c),
      };
    });
}
