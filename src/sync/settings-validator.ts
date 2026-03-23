/**
 * Settings Validator — validate settings.json structure and hook references
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  hookCount: number;
  sectionsFound: string[];
}

const REQUIRED_SECTIONS = ['env', 'permissions', 'hooks'];
const RECOMMENDED_SECTIONS = ['daidentity'];

interface HookEntry {
  type: string;
  command: string;
}

interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
}

export function validateSettings(settingsPath: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  let hookCount = 0;
  const sectionsFound: string[] = [];

  if (!existsSync(settingsPath)) {
    issues.push({ severity: 'error', field: 'root', message: `Settings file not found: ${settingsPath}` });
    return { valid: false, issues, hookCount, sectionsFound };
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch (e) {
    issues.push({ severity: 'error', field: 'root', message: `Invalid JSON: ${(e as Error).message}` });
    return { valid: false, issues, hookCount, sectionsFound };
  }

  // Check required sections
  for (const section of REQUIRED_SECTIONS) {
    if (section in settings) {
      sectionsFound.push(section);
    } else {
      issues.push({ severity: 'error', field: section, message: `Required section '${section}' is missing` });
    }
  }

  for (const section of RECOMMENDED_SECTIONS) {
    if (section in settings) {
      sectionsFound.push(section);
    } else {
      issues.push({ severity: 'warning', field: section, message: `Recommended section '${section}' is missing` });
    }
  }

  // Validate hooks — check that commands point to existing files
  if (settings.hooks && typeof settings.hooks === 'object') {
    const hooks = settings.hooks as Record<string, HookGroup[]>;
    for (const [eventName, groups] of Object.entries(hooks)) {
      if (!Array.isArray(groups)) {
        issues.push({ severity: 'error', field: `hooks.${eventName}`, message: 'Must be an array of hook groups' });
        continue;
      }
      for (const group of groups) {
        if (!group.hooks || !Array.isArray(group.hooks)) continue;
        for (const hook of group.hooks) {
          hookCount++;
          if (hook.type !== 'command') {
            issues.push({ severity: 'warning', field: `hooks.${eventName}`, message: `Unknown hook type: ${hook.type}` });
            continue;
          }
          // Extract file path from command like "bun $HOME/.claude/hooks/Foo.hook.ts"
          const cmdParts = hook.command.split(/\s+/);
          const filePart = cmdParts.find(p => p.includes('.hook.ts') || p.includes('.ts') || p.includes('.js'));
          if (filePart) {
            const resolved = filePart
              .replace(/\$HOME/g, process.env.HOME ?? '')
              .replace(/\$\{HOME\}/g, process.env.HOME ?? '')
              .replace(/~\//g, (process.env.HOME ?? '') + '/');
            if (!existsSync(resolved)) {
              issues.push({
                severity: 'error',
                field: `hooks.${eventName}`,
                message: `Hook file not found: ${filePart} (resolved: ${resolved})`,
              });
            }
          }
        }
      }
    }
  }

  // Validate permissions
  if (settings.permissions && typeof settings.permissions === 'object') {
    const perms = settings.permissions as Record<string, unknown>;
    if (perms.allow && !Array.isArray(perms.allow)) {
      issues.push({ severity: 'error', field: 'permissions.allow', message: 'Must be an array' });
    }
    if (perms.deny && !Array.isArray(perms.deny)) {
      issues.push({ severity: 'error', field: 'permissions.deny', message: 'Must be an array' });
    }
  }

  const hasErrors = issues.some(i => i.severity === 'error');
  return { valid: !hasErrors, issues, hookCount, sectionsFound };
}
