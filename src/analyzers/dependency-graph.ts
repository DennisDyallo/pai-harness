/**
 * Dependency Graph — static analysis of hook file dependencies
 *
 * Scans .hook.ts files for readFileSync/writeFileSync/existsSync calls,
 * extracts paths, and builds a directed graph of inter-hook data flow.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

export interface HookNode {
  name: string;
  path: string;
  reads: string[];
  writes: string[];
  checks: string[];
}

export interface Edge {
  from: string;
  to: string;
  via: string; // the shared file path
  type: 'write-read' | 'write-check';
}

export interface DependencyGraph {
  nodes: HookNode[];
  edges: Edge[];
}

export interface DependencyCheck {
  satisfied: boolean;
  missing: string[];
}

const FS_READ_PATTERN = /readFileSync\s*\(\s*(?:join\s*\([^)]*\)|`[^`]*`|'[^']*'|"[^"]*")/g;
const FS_WRITE_PATTERN = /writeFileSync\s*\(\s*(?:join\s*\([^)]*\)|`[^`]*`|'[^']*'|"[^"]*")/g;
const FS_EXISTS_PATTERN = /existsSync\s*\(\s*(?:join\s*\([^)]*\)|`[^`]*`|'[^']*'|"[^"]*")/g;

function extractPaths(source: string, pattern: RegExp): string[] {
  const paths: string[] = [];
  const matches = source.matchAll(pattern);
  for (const match of matches) {
    const call = match[0];
    // Extract string literals from the call
    const stringLiterals = call.match(/['"`]([^'"`]+)['"`]/g);
    if (stringLiterals) {
      for (const lit of stringLiterals) {
        const cleaned = lit.slice(1, -1);
        // Skip /dev/stdin, common non-file args
        if (cleaned === '/dev/stdin' || cleaned === 'utf-8' || cleaned === 'utf8') continue;
        // Focus on MEMORY/STATE paths and meaningful file references
        if (cleaned.includes('MEMORY') || cleaned.includes('STATE') ||
            cleaned.includes('settings') || cleaned.includes('CLAUDE') ||
            cleaned.includes('.json') || cleaned.includes('.md') ||
            cleaned.includes('.yaml') || cleaned.includes('.yml')) {
          paths.push(cleaned);
        }
      }
    }
    // Also extract join() components for MEMORY/STATE paths
    const joinMatch = call.match(/join\s*\(([^)]+)\)/);
    if (joinMatch) {
      const args = joinMatch[1];
      const parts = args.match(/['"`]([^'"`]+)['"`]/g);
      if (parts) {
        const joinedParts = parts.map(p => p.slice(1, -1)).filter(p => p !== 'utf-8');
        const joined = joinedParts.join('/');
        if (joined.includes('MEMORY') || joined.includes('STATE') ||
            joined.includes('settings') || joined.includes('learning') ||
            joined.includes('work') || joined.includes('.json')) {
          paths.push(joined);
        }
      }
    }
  }
  return [...new Set(paths)];
}

function scanHookFile(hookPath: string): HookNode {
  const source = readFileSync(hookPath, 'utf-8');
  const name = basename(hookPath, '.hook.ts');
  return {
    name,
    path: hookPath,
    reads: extractPaths(source, FS_READ_PATTERN),
    writes: extractPaths(source, FS_WRITE_PATTERN),
    checks: extractPaths(source, FS_EXISTS_PATTERN),
  };
}

export function generateGraph(hooksDir?: string): DependencyGraph {
  const dir = hooksDir ?? join(process.env.HOME ?? '', '.claude', 'hooks');
  if (!existsSync(dir)) return { nodes: [], edges: [] };

  const hookFiles = readdirSync(dir).filter(f => f.endsWith('.hook.ts'));
  const nodes = hookFiles.map(f => scanHookFile(join(dir, f)));
  const edges: Edge[] = [];

  // Build edges: hook A writes X, hook B reads/checks X
  for (const writer of nodes) {
    for (const writePath of writer.writes) {
      for (const reader of nodes) {
        if (reader.name === writer.name) continue;
        for (const readPath of reader.reads) {
          if (readPath === writePath || readPath.includes(writePath) || writePath.includes(readPath)) {
            edges.push({
              from: writer.name,
              to: reader.name,
              via: writePath,
              type: 'write-read',
            });
          }
        }
        for (const checkPath of reader.checks) {
          if (checkPath === writePath || checkPath.includes(writePath) || writePath.includes(checkPath)) {
            edges.push({
              from: writer.name,
              to: reader.name,
              via: writePath,
              type: 'write-check',
            });
          }
        }
      }
    }
  }

  // Deduplicate edges
  const uniqueEdges = edges.filter((e, i, arr) =>
    arr.findIndex(x => x.from === e.from && x.to === e.to && x.via === e.via) === i
  );

  return { nodes, edges: uniqueEdges };
}

export function printAsciiGraph(graph: DependencyGraph): string {
  const lines: string[] = ['Hook Dependency Graph', '='.repeat(40)];

  if (graph.nodes.length === 0) {
    lines.push('(no hooks found)');
    return lines.join('\n');
  }

  lines.push(`${graph.nodes.length} hooks, ${graph.edges.length} dependencies\n`);

  for (const node of graph.nodes) {
    const outEdges = graph.edges.filter(e => e.from === node.name);
    const inEdges = graph.edges.filter(e => e.to === node.name);
    lines.push(`[${node.name}]`);
    if (node.reads.length) lines.push(`  reads: ${node.reads.join(', ')}`);
    if (node.writes.length) lines.push(`  writes: ${node.writes.join(', ')}`);
    for (const e of outEdges) {
      lines.push(`  --> ${e.to} (via ${e.via})`);
    }
    for (const e of inEdges) {
      lines.push(`  <-- ${e.from} (via ${e.via})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function checkDependencies(hooksDir?: string): DependencyCheck {
  const graph = generateGraph(hooksDir);
  const missing: string[] = [];

  for (const edge of graph.edges) {
    // Check that the writer hook exists
    const writerExists = graph.nodes.some(n => n.name === edge.from);
    const readerExists = graph.nodes.some(n => n.name === edge.to);
    if (!writerExists) missing.push(`Writer hook '${edge.from}' not found`);
    if (!readerExists) missing.push(`Reader hook '${edge.to}' not found`);
  }

  // Check that hooks with reads have corresponding writers (or the files exist statically)
  for (const node of graph.nodes) {
    for (const readPath of node.reads) {
      const hasWriter = graph.edges.some(e => e.to === node.name && e.via === readPath);
      if (!hasWriter && readPath.includes('MEMORY/STATE')) {
        missing.push(`${node.name} reads '${readPath}' but no hook writes it`);
      }
    }
  }

  return { satisfied: missing.length === 0, missing: [...new Set(missing)] };
}
