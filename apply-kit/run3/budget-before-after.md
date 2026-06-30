# Run 3 — Before/After MCP Budget (against the clone)

Measured offline against the clone's post-edit config. Plugin server defs read read-only
from the LIVE plugin cache (`~/.claude/plugins/cache/...`); active/inactive status driven by
the clone's `enabledPlugins` + `.claude.json` mcpServers. atlassian is remote (unmeasured).

## BEFORE (all 5 active)

| server | ~tokens | note |
|--------|--------:|------|
| chrome-devtools | 6,655 | ok |
| vslsp | 4,366 | ok |
| playwright | 4,977 | ok |
| context7 | 1,317 | ok |
| atlassian | 0 | remote-no-command (http/sse; requires auth, unmeasured) |
| **TOTAL** | **17,313** | (measurable rows only) |

## AFTER (vslsp / context7 / atlassian made on-demand)

| server | ~tokens | note |
|--------|--------:|------|
| chrome-devtools | 6,655 | ok |
| playwright | 4,977 | ok |
| **TOTAL** | **11,631** | |

The disabled rows (vslsp, context7, atlassian) drop out of the AFTER set — confirming the
clone config change takes effect.

## RECOVERED

**~5,682 measurable tokens** (vslsp 4,366 + context7 1,317), plus atlassian's unmeasured
remote tool schema.

## How to reproduce

```bash
# The harness CLI now supports --include-plugins to also measure plugin .mcp.json servers:
bun bin/pai-harness.ts context-budget --live-mcp --include-plugins

# Or the focused before/after script used for this report (reads clone + live cache):
#   /tmp/budget-run3.ts  (one-off; reads the clone's .claude.json + .run3.bak + settings.json)
```
