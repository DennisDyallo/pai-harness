# Run 3 — Re-enable Guide (turn on-demand MCP servers back on)

Two different mechanisms, because two different config sources:

- **vslsp** → defined in `~/.claude.json` `mcpServers` → re-add the block.
- **context7 / atlassian** → plugin-provided → flip `enabledPlugins[...]` back to `true` in
  `~/.claude/settings.json`.

> These steps describe the LIVE files. In Run 3 they were applied only inside the throwaway
> clone. To go live, apply the same edits to `~/.claude.json` and `~/.claude/settings.json`.

---

## vslsp (`.claude.json`-based)

**Disabled by:** removing the `vslsp` entry from `mcpServers` in `~/.claude.json`.

**To re-enable**, add it back to `~/.claude.json` → `mcpServers`:

```json
"vslsp": {
  "type": "stdio",
  "command": "/Users/Dennis.Dyall/.local/bin/vslsp-mcp",
  "args": []
}
```

Restart Claude Code (the `mcpServers` block is read at startup).

> Why removal (not `disabledMcpjsonServers`): `disabledMcpjsonServers` /
> `enabledMcpjsonServers` apply to **project-scoped** `.mcp.json` servers, not to user-level
> `~/.claude.json` `mcpServers` entries. For a user-level server, removing the entry is the
> clean, fully-reversible lever. Keep this snippet to restore it verbatim.

---

## context7 (plugin-based)

**Disabled by:** setting `enabledPlugins["context7@claude-plugins-official"] = false` in
`~/.claude/settings.json`.

**To re-enable**, flip it back to `true`:

```jsonc
"enabledPlugins": {
  "context7@claude-plugins-official": true,   // was false
  ...
}
```

Restart Claude Code. (Disabling the plugin also disables its `/query-docs` skill etc. —
that is the on-demand tradeoff. Re-enabling restores both the MCP server and the skill.)

Underlying server def (for reference, do not edit):
`~/.claude/plugins/cache/claude-plugins-official/context7/unknown/.mcp.json`
→ `{ "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] } }`

---

## atlassian (plugin-based, remote/OAuth)

**Disabled by:** setting `enabledPlugins["atlassian@claude-plugins-official"] = false` in
`~/.claude/settings.json`.

**To re-enable**, flip it back to `true`:

```jsonc
"enabledPlugins": {
  "atlassian@claude-plugins-official": true,  // was false
  ...
}
```

Restart Claude Code. Because atlassian is a **remote HTTP/OAuth** MCP
(`https://mcp.atlassian.com/v1/mcp/authv2`), after re-enabling you must complete the OAuth
flow again (`mcp__plugin_atlassian_atlassian__authenticate`) before its tools work.

Underlying server def (for reference, do not edit):
`~/.claude/plugins/cache/claude-plugins-official/atlassian/201c1b20ef45/.mcp.json`
→ `{ "mcpServers": { "atlassian": { "type": "http", "url": "https://mcp.atlassian.com/v1/mcp/authv2" } } }`

---

## Summary

| Server | Disable mechanism | Re-enable = |
|--------|-------------------|-------------|
| vslsp | remove from `~/.claude.json` `mcpServers` | re-add the JSON block above |
| context7 | `enabledPlugins[...] = false` in `settings.json` | set back to `true` |
| atlassian | `enabledPlugins[...] = false` in `settings.json` | set back to `true` + re-auth OAuth |

`installed_plugins.json` was **NOT** edited — `enabledPlugins` is the supported, reversible
plugin toggle and leaves the install manifest intact.
