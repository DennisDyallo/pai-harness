#!/usr/bin/env bun
/**
 * Broken stub MCP server for testing failure handling in the measurer.
 *
 * It NEVER returns a valid tools/list response: it writes a couple of chatty
 * stderr lines (to exercise stderr draining) and exits non-zero before the
 * handshake completes. The measurer must record this as unmeasured-with-error,
 * NOT as a tiny ~2-char `[]` schema.
 */

process.stderr.write("[broken-mcp] failed to initialize: missing API key\n");
process.stderr.write("[broken-mcp] aborting\n");
process.exit(1);
