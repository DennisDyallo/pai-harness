/**
 * PersonaConversationArchive.test.ts — SessionEnd terminal persona archival.
 *
 * Runs the live ~/.claude/hooks/PersonaConversationArchive.hook.ts as a
 * subprocess against a sandbox PAI_DIR (persona-mode flag) + a temp
 * PAI_VAULT_PATH (watashi persona dir), with a temp transcript on disk.
 *
 * Asserts the ISA contract:
 *   - ISC-19: no active persona → exit 0, writes nothing.
 *   - ISC-20: active persona → writes <persona-dir>/conversations/<date>-<sid8>.md.
 *   - ISC-21: appends a dated, EXTRACTIVE journal anchor (turn count + first
 *             user + last assistant), with NO inference.
 *   - ISC-22: clears the persona flag after archiving.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSessionEndInput } from "../../../src/core/fixtures";
import { runHook } from "../../../src/core/runner";
import { createSandbox } from "../../../src/core/sandbox";
import type { Sandbox } from "../../../src/core/types";

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/PersonaConversationArchive.hook.ts`;

const SID = "abcd1234efgh5678";

let sandbox: Sandbox;
let vaultDir: string;
let transcriptPath: string;

/** Build a minimal Claude transcript .jsonl with the given turns. */
function writeTranscript(
	path: string,
	turns: Array<{ role: "user" | "assistant"; text: string }>,
): void {
	const lines = turns.map((t) =>
		JSON.stringify({
			type: t.role === "user" ? "user" : "assistant",
			message: { content: t.text },
		}),
	);
	writeFileSync(path, `${lines.join("\n")}\n`);
}

/** Write a persona-mode flag into the sandbox PAI_DIR. */
function setActiveFlag(paiDir: string, sid: string, persona: string): void {
	const dir = join(paiDir, "MEMORY/STATE/persona-mode");
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${sid}.json`),
		JSON.stringify({ active: persona, ts: Date.now() }),
	);
}

function watashiDir(): string {
	return join(vaultDir, "_System/Daemons/watashi");
}

beforeEach(() => {
	vaultDir = mkdtempSync(join(tmpdir(), "archive-vault-"));
	// Seed the watashi persona files at the registry's expected daemon path.
	const wDir = watashiDir();
	mkdirSync(wDir, { recursive: true });
	writeFileSync(join(wDir, "persona.md"), "# Watashi\n\nYou are Watashi.");
	writeFileSync(join(wDir, "journal.md"), "# Watashi's Journal\n");

	transcriptPath = join(vaultDir, "transcript.jsonl");

	sandbox = createSandbox({
		env: { PAI_VAULT_PATH: vaultDir },
	});
});

afterEach(() => {
	sandbox.cleanup();
	rmSync(vaultDir, { recursive: true, force: true });
});

describe("PersonaConversationArchive", () => {
	it("ISC-19: no active persona → exit 0 and writes nothing", async () => {
		writeTranscript(transcriptPath, [
			{ role: "user", text: "hello" },
			{ role: "assistant", text: "hi" },
		]);
		// No persona flag set for SID.
		const input = makeSessionEndInput({
			session_id: SID,
			transcript_path: transcriptPath,
		});
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(existsSync(join(watashiDir(), "conversations"))).toBe(false);
		// Journal untouched (still just the header).
		expect(readFileSync(join(watashiDir(), "journal.md"), "utf-8").trim()).toBe(
			"# Watashi's Journal",
		);
	});

	it("ISC-20 + ISC-21 + ISC-22: archives, appends anchor, clears flag", async () => {
		setActiveFlag(sandbox.env.PAI_DIR, SID, "watashi");
		writeTranscript(transcriptPath, [
			{ role: "user", text: "I keep avoiding the apartment paperwork." },
			{ role: "assistant", text: "What feels heaviest about it?" },
			{ role: "user", text: "The finality, I think." },
			{ role: "assistant", text: "Let's sit with the finality for a moment." },
		]);

		const input = makeSessionEndInput({
			session_id: SID,
			transcript_path: transcriptPath,
		});
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);

		// ISC-20: conversations file written with the <date>-<sid8>.md naming.
		const convDir = join(watashiDir(), "conversations");
		expect(existsSync(convDir)).toBe(true);
		const date = new Date().toISOString().slice(0, 10);
		const expectedFile = join(convDir, `${date}-${SID.slice(0, 8)}.md`);
		expect(existsSync(expectedFile)).toBe(true);
		const conv = readFileSync(expectedFile, "utf-8");
		expect(conv).toContain("apartment paperwork");
		expect(conv).toContain("Watashi —");

		// ISC-21: journal anchor — turn count + first user + last assistant.
		const journal = readFileSync(join(watashiDir(), "journal.md"), "utf-8");
		expect(journal).toContain("Terminal conversation (4 turns");
		expect(journal).toContain(
			"Dennis opened: I keep avoiding the apartment paperwork.",
		);
		expect(journal).toContain("sit with the finality");

		// ISC-22: flag cleared.
		const flagPath = join(
			sandbox.env.PAI_DIR,
			"MEMORY/STATE/persona-mode",
			`${SID}.json`,
		);
		expect(existsSync(flagPath)).toBe(false);
	});

	it("exits 0 even when the transcript path is missing", async () => {
		setActiveFlag(sandbox.env.PAI_DIR, SID, "watashi");
		const input = makeSessionEndInput({
			session_id: SID,
			transcript_path: "/tmp/does-not-exist.jsonl",
		});
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });
		expect(result.exitCode).toBe(0);
		// Still clears the flag (best-effort cleanup).
		const flagPath = join(
			sandbox.env.PAI_DIR,
			"MEMORY/STATE/persona-mode",
			`${SID}.json`,
		);
		expect(existsSync(flagPath)).toBe(false);
	});

	it("sanitizes a malformed session_id so it cannot escape the archive dir (fix #3)", async () => {
		// A session_id laden with traversal-style dots. It is slash-free so the
		// flag file itself is writable, but `..` and `.` MUST be stripped before
		// the sid is used in the archive filename (defense against path traversal).
		const evilSid = "..evil..x";
		setActiveFlag(sandbox.env.PAI_DIR, evilSid, "watashi");
		writeTranscript(transcriptPath, [
			{ role: "user", text: "hi" },
			{ role: "assistant", text: "hello" },
		]);
		const input = makeSessionEndInput({
			session_id: evilSid,
			transcript_path: transcriptPath,
		});
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });
		expect(result.exitCode).toBe(0);

		const convDir = join(watashiDir(), "conversations");
		expect(existsSync(convDir)).toBe(true);
		const { readdirSync } = require("node:fs");
		const files: string[] = readdirSync(convDir);
		expect(files.length).toBe(1);
		// Filename contains no path separators or ".." traversal sequences.
		expect(files[0]).not.toContain("/");
		expect(files[0]).not.toContain("..");
		// "..evil..x" → strip non-[A-Za-z0-9_-] → "evilx" → first 8 chars.
		const date = new Date().toISOString().slice(0, 10);
		expect(files[0]).toBe(`${date}-evilx.md`);
	});
});
