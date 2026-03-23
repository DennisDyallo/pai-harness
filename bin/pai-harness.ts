#!/usr/bin/env bun
/**
 * PAI Harness CLI — entry point
 */

import { join } from 'path';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
pai-harness — PAI Hook Testing & Validation

Usage:
  pai-harness test [unit|integration|analysis]  Run tests
  pai-harness test --hook <name>                Test single hook
  pai-harness run <hook> --event <type>         Execute hook in sandbox
  pai-harness validate state                    Check state file integrity
  pai-harness validate drift                    Config/hooks sync check
  pai-harness validate settings                 Schema validation
  pai-harness validate output                   Verify hook outputs match schema
  pai-harness context --tokens                  Show context assembly + tokens
  pai-harness graph [--dot|--check]             Hook dependency graph
  pai-harness bench [--hook <name>]             Benchmark hooks
  pai-harness mock-api start [--port N] [--scenario name]  Start mock API server
  pai-harness mock-api stop                     Stop mock API server
  pai-harness proxy [--port N]                  Print proxy setup instructions
  pai-harness logs                              List recent sessions
  pai-harness logs --session <id>               Parse specific session
  pai-harness logs --hooks-only                 Extract hook data
  pai-harness logs --errors                     Show errors
  pai-harness live tail                         Tail PAI_HARNESS_LOG with formatting
  pai-harness replay <logfile>                  Replay captured invocations
  `.trim());
}

switch (command) {
  case 'test': {
    const filter = args[1];
    const hookFlag = args.indexOf('--hook');
    let cmd = 'bun test';
    if (hookFlag !== -1 && args[hookFlag + 1]) {
      cmd += ` --filter "${args[hookFlag + 1]}"`;
    } else if (filter === 'unit') {
      cmd += ' tests/unit/';
    } else if (filter === 'integration') {
      cmd += ' tests/integration/';
    } else if (filter === 'analysis') {
      cmd += ' tests/analysis/';
    }
    const proc = Bun.spawn(['sh', '-c', cmd], {
      stdio: ['inherit', 'inherit', 'inherit'],
      cwd: import.meta.dir.replace('/bin', ''),
    });
    await proc.exited;
    process.exit(proc.exitCode ?? 0);
    break;
  }

  case 'validate': {
    const subcommand = args[1];
    if (subcommand === 'drift') {
      const { detectDrift, formatDriftReport } = await import('../src/sync/drift-detector');
      const report = detectDrift();
      console.log(formatDriftReport(report));
      process.exit(report.hasDrift ? 1 : 0);
    } else if (subcommand === 'settings') {
      const { validateSettings } = await import('../src/sync/settings-validator');
      const settingsPath = args[2] ?? join(process.env.HOME ?? '', '.claude', 'settings.json');
      const result = validateSettings(settingsPath);
      console.log(`Settings validation: ${result.valid ? 'PASS' : 'FAIL'}`);
      console.log(`Hooks: ${result.hookCount}, Sections: ${result.sectionsFound.join(', ')}`);
      for (const issue of result.issues) {
        console.log(`  [${issue.severity}] ${issue.field}: ${issue.message}`);
      }
      process.exit(result.valid ? 0 : 1);
    } else if (subcommand === 'state') {
      const paiDir = process.env.PAI_DIR ?? join(process.env.HOME ?? '', '.claude');
      const stateDir = join(paiDir, 'MEMORY', 'STATE');
      const { readdirSync, readFileSync, existsSync } = await import('fs');
      if (!existsSync(stateDir)) {
        console.error(`State directory not found: ${stateDir}`);
        process.exit(1);
      }
      const files = readdirSync(stateDir).filter(f => f.endsWith('.json'));
      let valid = 0, invalid = 0;
      for (const file of files) {
        try {
          JSON.parse(readFileSync(join(stateDir, file), 'utf-8'));
          valid++;
        } catch (e) {
          console.error(`  INVALID: ${file} — ${(e as Error).message}`);
          invalid++;
        }
      }
      console.log(`State files: ${valid} valid, ${invalid} invalid (${files.length} total)`);
      process.exit(invalid > 0 ? 1 : 0);
    } else {
      console.error(`Unknown validate subcommand: ${subcommand}`);
      console.log('Usage: pai-harness validate [drift|settings|state]');
      process.exit(1);
    }
    break;
  }

  case 'context': {
    const { assembleContext } = await import('../src/analyzers/context-assembly');
    const { analyzeContextBudget, formatBudgetTable } = await import('../src/analyzers/context-tokens');
    const pieces = assembleContext();
    if (args.includes('--tokens')) {
      const budget = analyzeContextBudget(pieces);
      console.log(formatBudgetTable(budget));
    } else {
      for (const piece of pieces) {
        console.log(`[${piece.source}] ${piece.chars} chars`);
      }
    }
    break;
  }

  case 'graph': {
    const { generateGraph, printAsciiGraph, checkDependencies } = await import('../src/analyzers/dependency-graph');
    if (args.includes('--check')) {
      const check = checkDependencies();
      if (check.satisfied) {
        console.log('All hook dependencies satisfied.');
      } else {
        console.log('Missing dependencies:');
        for (const m of check.missing) console.log(`  - ${m}`);
      }
      process.exit(check.satisfied ? 0 : 1);
    } else {
      const graph = generateGraph();
      console.log(printAsciiGraph(graph));
    }
    break;
  }

  case 'logs': {
    const { listSessions, parseSession, filterHookEntries, filterErrors } = await import('../src/live/log-parser');
    const sessionFlag = args.indexOf('--session');
    const hooksOnly = args.includes('--hooks-only');
    const errorsOnly = args.includes('--errors');

    if (sessionFlag !== -1 && args[sessionFlag + 1]) {
      const sessionId = args[sessionFlag + 1];
      const sessions = listSessions();
      const match = sessions.find(s => s.id === sessionId || s.path.includes(sessionId));
      if (!match) {
        console.error(`Session not found: ${sessionId}`);
        process.exit(1);
      }
      const entries = parseSession(match.path);
      if (hooksOnly) {
        const hooks = filterHookEntries(entries);
        for (const h of hooks) console.log(`[${h.timestamp}] ${h.hookName} (${h.event})`);
        console.log(`\n${hooks.length} hook entries`);
      } else if (errorsOnly) {
        const errs = filterErrors(entries);
        for (const e of errs) console.log(`[${e.timestamp}] ${e.message}`);
        console.log(`\n${errs.length} errors`);
      } else {
        for (const e of entries) console.log(`[${e.timestamp}] ${e.type}: ${JSON.stringify(e.content).slice(0, 120)}`);
        console.log(`\n${entries.length} entries`);
      }
    } else {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log('No sessions found.');
      } else {
        console.log('Recent sessions:');
        for (const s of sessions.slice(0, 20)) {
          const size = s.sizeBytes > 1024 ? `${(s.sizeBytes / 1024).toFixed(1)}KB` : `${s.sizeBytes}B`;
          console.log(`  ${s.id}  ${s.date.toISOString().slice(0, 19)}  ${size}`);
        }
        console.log(`\n${sessions.length} total sessions`);
      }
    }
    break;
  }

  case 'live': {
    const subCmd = args[1];
    if (subCmd === 'tail') {
      const logPath = process.env.PAI_HARNESS_LOG;
      if (!logPath) {
        console.error('PAI_HARNESS_LOG env var not set. Set it to a file path to enable logging.');
        process.exit(1);
      }
      const { existsSync } = await import('fs');
      if (!existsSync(logPath)) {
        console.error(`Log file not found: ${logPath}`);
        process.exit(1);
      }
      console.log(`Tailing ${logPath} ...\n`);
      const proc = Bun.spawn(['tail', '-f', logPath], {
        stdout: 'pipe',
        stderr: 'inherit',
      });
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            const code = entry.exitCode === 0 ? '\x1b[32m0\x1b[0m' : `\x1b[31m${entry.exitCode}\x1b[0m`;
            console.log(`\x1b[90m${entry.ts}\x1b[0m \x1b[36m${entry.hook}\x1b[0m [${entry.event}] exit=${code} ${entry.durationMs}ms`);
          } catch {
            process.stdout.write(line + '\n');
          }
        }
      }
    } else {
      console.log('Usage: pai-harness live tail');
      process.exit(1);
    }
    break;
  }

  case 'replay': {
    const logFile = args[1];
    if (!logFile) {
      console.error('Usage: pai-harness replay <logfile>');
      process.exit(1);
    }
    const { replayLog } = await import('../src/live/replay');
    console.log(`Replaying ${logFile} ...\n`);
    const results = await replayLog(logFile);
    let matched = 0;
    for (const r of results) {
      const status = r.match ? '\x1b[32mMATCH\x1b[0m' : '\x1b[31mDIFF\x1b[0m';
      console.log(`  ${status} ${r.hook} [${r.event}] original=${r.originalExitCode} replay=${r.replayExitCode} ${r.durationMs.toFixed(0)}ms`);
      if (r.match) matched++;
    }
    console.log(`\n${matched}/${results.length} matched`);
    process.exit(matched === results.length ? 0 : 1);
    break;
  }

  case 'mock-api': {
    const subCmd = args[1];
    if (subCmd === 'start') {
      const portFlag = args.indexOf('--port');
      const scenarioFlag = args.indexOf('--scenario');
      const port = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : undefined;
      const scenario = scenarioFlag !== -1 ? args[scenarioFlag + 1] : undefined;
      const { startMockServer } = await import('../src/mock-api/server');
      const server = startMockServer({ port, scenario });
      console.log(`Mock API server started on ${server.url}`);
      console.log(`Scenario: ${scenario ?? 'basic-session'}`);
      console.log(`\nSet ANTHROPIC_BASE_URL=${server.url} to use with Claude Code`);
      console.log('Press Ctrl+C to stop.');
      // Keep process alive
      await new Promise(() => {});
    } else if (subCmd === 'stop') {
      console.log('Mock API server runs in the foreground. Use Ctrl+C to stop it.');
    } else {
      console.error('Usage: pai-harness mock-api start [--port N] [--scenario name]');
      process.exit(1);
    }
    break;
  }

  case 'proxy': {
    const portFlag = args.indexOf('--port');
    const port = portFlag !== -1 ? parseInt(args[portFlag + 1], 10) : undefined;
    const { printProxyInstructions } = await import('../src/mock-api/proxy');
    printProxyInstructions(port);
    break;
  }

  case 'run':
  case 'bench':
    console.log(`[pai-harness] '${command}' — not yet implemented. Coming in Phase 6+.`);
    process.exit(0);
    break;

  case 'help':
  case '--help':
  case '-h':
  case undefined:
    usage();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}
