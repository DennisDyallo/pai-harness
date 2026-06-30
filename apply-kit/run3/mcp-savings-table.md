# Run 3 — MCP Tool-Schema Savings Table

Measured **offline** (stdio JSON-RPC `initialize` → `tools/list`; no `claude --bare`, no
inference). Token estimate = serialized-tool-schema chars ÷ 3.5 (harness convention,
`context-tokens.ts`). Measured against the LIVE configs (`~/.claude.json` mcpServers +
LIVE plugin-cache `.mcp.json` defs, read-only) on 2026-06-30.

| Server | Source | Enabled by default after Run 3? | Tokens | Measurable? |
|--------|--------|---------------------------------|-------:|-------------|
| chrome-devtools | `~/.claude.json` mcpServers | ✅ KEEP (always-on) | 6,655 | ✅ |
| playwright | plugin `.mcp.json` (npx `@playwright/mcp`) | ✅ KEEP (always-on) | 4,977 | ✅ |
| vslsp | `~/.claude.json` mcpServers (`vslsp-mcp`) | ⏸️ ON-DEMAND | 4,366 | ✅ |
| context7 | plugin `.mcp.json` (npx `@upstash/context7-mcp`) | ⏸️ ON-DEMAND | 1,317 | ✅ |
| atlassian | plugin `.mcp.json` (`type:"http"`, remote/OAuth) | ⏸️ ON-DEMAND | — | ❌ remote (OAuth; offline-unmeasurable) |

## Savings

- **Always-on retained:** chrome-devtools (6,655) + playwright (4,977) = **11,632 tok**
- **Recovered (made on-demand):** vslsp (4,366) + context7 (1,317) = **~5,683 tok measured**
  - **plus** atlassian's remote tool schema (unmeasured offline; non-zero when connected)

## Notes

- atlassian is a **remote HTTP/OAuth** MCP (`https://mcp.atlassian.com/v1/mcp/authv2`).
  It has no spawnable `command`, so its tool schema cannot be measured via offline stdio.
  It is recorded as `unmeasured (remote/OAuth)` — no auth was attempted. Its real always-on
  cost is non-zero (Claude Code fetches its tools/list over HTTP when the plugin is enabled),
  so disabling it recovers additional tokens beyond the ~5,683 measured.
- chrome-devtools (6,655) and vslsp (4,366) match the Run 1 baselines exactly — measurement
  is stable.
