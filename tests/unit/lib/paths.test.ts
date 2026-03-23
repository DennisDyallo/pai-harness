import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';
import { getPaiDir, expandPath, getSettingsPath, paiPath } from '../../../../../.claude/hooks/lib/paths';

describe('paths', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ['PAI_DIR', 'CLAUDE_CONFIG_DIR'];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('getPaiDir', () => {
    it('returns homedir()/.claude with no env vars', () => {
      expect(getPaiDir()).toBe(join(homedir(), '.claude'));
    });

    it('returns expanded PAI_DIR when set', () => {
      process.env.PAI_DIR = '/tmp/custom-pai';
      expect(getPaiDir()).toBe('/tmp/custom-pai');
    });

    it('returns CLAUDE_CONFIG_DIR when set (highest priority)', () => {
      process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-config';
      expect(getPaiDir()).toBe('/tmp/claude-config');
    });

    it('CLAUDE_CONFIG_DIR wins when both are set', () => {
      process.env.PAI_DIR = '/tmp/pai-dir';
      process.env.CLAUDE_CONFIG_DIR = '/tmp/claude-config';
      expect(getPaiDir()).toBe('/tmp/claude-config');
    });

    it('expands $HOME in PAI_DIR', () => {
      process.env.PAI_DIR = '$HOME/.my-pai';
      expect(getPaiDir()).toBe(join(homedir(), '.my-pai'));
    });

    it('expands ~ in CLAUDE_CONFIG_DIR', () => {
      process.env.CLAUDE_CONFIG_DIR = '~/.my-config';
      expect(getPaiDir()).toBe(join(homedir(), '.my-config'));
    });
  });

  describe('expandPath', () => {
    it('expands $HOME at start of path', () => {
      expect(expandPath('$HOME/foo')).toBe(join(homedir(), 'foo'));
    });

    it('expands ~ at start of path', () => {
      expect(expandPath('~/bar')).toBe(join(homedir(), 'bar'));
    });

    it('expands ${HOME} at start of path', () => {
      expect(expandPath('${HOME}/baz')).toBe(join(homedir(), 'baz'));
    });

    it('does not expand $HOME in the middle of path', () => {
      expect(expandPath('/foo/$HOME/bar')).toBe('/foo/$HOME/bar');
    });

    it('returns absolute paths unchanged', () => {
      expect(expandPath('/usr/local/bin')).toBe('/usr/local/bin');
    });
  });

  describe('getSettingsPath', () => {
    it('returns getPaiDir()/settings.json', () => {
      expect(getSettingsPath()).toBe(join(getPaiDir(), 'settings.json'));
    });

    it('respects PAI_DIR', () => {
      process.env.PAI_DIR = '/tmp/test-pai';
      expect(getSettingsPath()).toBe('/tmp/test-pai/settings.json');
    });
  });

  describe('paiPath', () => {
    it('returns getPaiDir()/hooks for paiPath("hooks")', () => {
      expect(paiPath('hooks')).toBe(join(getPaiDir(), 'hooks'));
    });

    it('joins multiple segments', () => {
      expect(paiPath('hooks', 'lib', 'paths.ts')).toBe(
        join(getPaiDir(), 'hooks', 'lib', 'paths.ts')
      );
    });
  });
});
