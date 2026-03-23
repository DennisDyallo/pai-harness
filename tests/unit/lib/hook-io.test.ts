import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { hookLog } from '../../../../../.claude/hooks/lib/hook-io';

describe('hookLog', () => {
  let spy: ReturnType<typeof spyOn>;
  let savedLogLevel: string | undefined;

  beforeEach(() => {
    spy = spyOn(console, 'error').mockImplementation(() => {});
    savedLogLevel = process.env.PAI_HOOK_LOG_LEVEL;
    delete process.env.PAI_HOOK_LOG_LEVEL;
  });

  afterEach(() => {
    spy.mockRestore();
    if (savedLogLevel === undefined) {
      delete process.env.PAI_HOOK_LOG_LEVEL;
    } else {
      process.env.PAI_HOOK_LOG_LEVEL = savedLogLevel;
    }
  });

  it('outputs when level >= configured (default: warn)', () => {
    hookLog('warn', 'test-hook', 'a warning');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('[test-hook]');
    expect(spy.mock.calls[0][0]).toContain('warn');
    expect(spy.mock.calls[0][0]).toContain('a warning');
  });

  it('outputs error when default level is warn', () => {
    hookLog('error', 'test-hook', 'an error');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('error');
  });

  it('is silent when level < configured (default: warn)', () => {
    hookLog('debug', 'test-hook', 'debug msg');
    expect(spy).not.toHaveBeenCalled();

    hookLog('info', 'test-hook', 'info msg');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows all levels when PAI_HOOK_LOG_LEVEL=debug', () => {
    process.env.PAI_HOOK_LOG_LEVEL = 'debug';

    hookLog('debug', 'test-hook', 'debug msg');
    expect(spy).toHaveBeenCalledTimes(1);

    hookLog('info', 'test-hook', 'info msg');
    expect(spy).toHaveBeenCalledTimes(2);

    hookLog('warn', 'test-hook', 'warn msg');
    expect(spy).toHaveBeenCalledTimes(3);

    hookLog('error', 'test-hook', 'error msg');
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('only shows errors when PAI_HOOK_LOG_LEVEL=error', () => {
    process.env.PAI_HOOK_LOG_LEVEL = 'error';

    hookLog('debug', 'test-hook', 'nope');
    hookLog('info', 'test-hook', 'nope');
    hookLog('warn', 'test-hook', 'nope');
    expect(spy).not.toHaveBeenCalled();

    hookLog('error', 'test-hook', 'yes');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('includes JSON data when data parameter is provided', () => {
    hookLog('warn', 'test-hook', 'with data', { key: 'value', count: 42 });
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain('{"key":"value","count":42}');
  });

  it('does not include data suffix when data is undefined', () => {
    hookLog('warn', 'test-hook', 'no data');
    const output = spy.mock.calls[0][0] as string;
    expect(output).toBe('[test-hook] warn: no data');
  });
});
