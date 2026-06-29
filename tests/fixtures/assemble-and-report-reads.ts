#!/usr/bin/env bun
/**
 * Subprocess harness for the isolation proof.
 *
 * Runs `assembleContext` against the clone dir given as argv[2], with
 * HOME/CLAUDE_CONFIG_DIR/PAI_DIR already pointed at the clone by the parent,
 * and prints the recorded absolute read paths as JSON to stdout. The parent
 * test asserts none are under live ~/.claude. Running in a subprocess means
 * the assembler resolves paths purely from the injected env — there is no
 * shared in-process state with the test that could mask a live read.
 */

import { assembleContext } from "../../src/analyzers/context-assembly";

const cloneDir = process.argv[2];
if (!cloneDir) {
	console.error("usage: assemble-and-report-reads.ts <cloneDir>");
	process.exit(2);
}

const recordedReads: string[] = [];
const pieces = assembleContext(cloneDir, recordedReads);

process.stdout.write(
	JSON.stringify({
		recordedReads,
		pieceCount: pieces.length,
		resolvedPaths: pieces
			.map((p) => p.resolvedPath)
			.filter((p): p is string => typeof p === "string"),
	}),
);
