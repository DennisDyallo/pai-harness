import { describe, it, expect } from 'bun:test';
import { getProxyConfig, printProxyInstructions } from '../../../src/mock-api/proxy';

describe('proxy', () => {
  describe('getProxyConfig', () => {
    it('returns default port 8080 config', () => {
      const config = getProxyConfig();
      expect(config.HTTPS_PROXY).toBe('http://localhost:8080');
      expect(config.HTTP_PROXY).toBe('http://localhost:8080');
      expect(config.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    it('accepts custom port', () => {
      const config = getProxyConfig(9999);
      expect(config.HTTPS_PROXY).toBe('http://localhost:9999');
      expect(config.HTTP_PROXY).toBe('http://localhost:9999');
    });
  });

  describe('printProxyInstructions', () => {
    it('prints without error', () => {
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => logs.push(msg);
      printProxyInstructions();
      console.log = origLog;
      const output = logs.join('\n');
      expect(output).toContain('mitmproxy');
      expect(output).toContain('Proxyman');
      expect(output).toContain('ANTHROPIC_BASE_URL');
    });

    it('uses custom port in instructions', () => {
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (msg: string) => logs.push(msg);
      printProxyInstructions(3128);
      console.log = origLog;
      const output = logs.join('\n');
      expect(output).toContain('3128');
    });
  });
});
