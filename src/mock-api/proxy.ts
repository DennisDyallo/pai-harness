/**
 * Proxy — convenience wrapper for HTTPS_PROXY debugging with mitmproxy/Proxyman
 */

export interface ProxyConfig {
  HTTPS_PROXY: string;
  HTTP_PROXY: string;
  NODE_TLS_REJECT_UNAUTHORIZED: string;
}

export function getProxyConfig(port = 8080): ProxyConfig {
  return {
    HTTPS_PROXY: `http://localhost:${port}`,
    HTTP_PROXY: `http://localhost:${port}`,
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
  };
}

export function printProxyInstructions(port = 8080): void {
  const config = getProxyConfig(port);

  console.log(`
Proxy Setup for Anthropic API Inspection
=========================================

Option 1: mitmproxy (CLI)
  brew install mitmproxy
  mitmproxy --listen-port ${port}

Option 2: Proxyman (GUI)
  https://proxyman.io — start with default settings

Then run Claude Code with proxy env vars:
  ${Object.entries(config).map(([k, v]) => `${k}=${v}`).join(' \\\n  ')} \\
  claude

Or export them in your shell:
${Object.entries(config).map(([k, v]) => `  export ${k}="${v}"`).join('\n')}

Mock API server (no proxy needed):
  pai-harness mock-api start --port 8787
  ANTHROPIC_BASE_URL=http://localhost:8787 claude
`.trim());
}
