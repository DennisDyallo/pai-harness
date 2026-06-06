/**
 * persona-mode.test.ts — Persona Mode state machine + reminder assembly.
 *
 * Exercises the live ~/.claude/hooks/lib/persona-mode.ts (via @pai-lib) against
 * a temp PAI_DIR (session flags) and temp PAI_VAULT_PATH (persona files), so it
 * never touches real state or the real vault.
 *
 * persona-registry resolves the vault from PAI_VAULT_PATH ONCE at module load,
 * and bun caches modules across tests — so env + dirs are set up once in
 * beforeAll (stable paths), with per-test isolation via clearPersona().
 *
 * Regression guard for Persona Mode: a session with an active persona must NOT
 * receive the builder algorithm — the hook injects the persona voice instead.
 */

import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SID = "test-session-persona";

const paiDir = mkdtempSync(join(tmpdir(), "pai-mode-"));
const vaultDir = mkdtempSync(join(tmpdir(), "pai-vault-"));

// Save real env so we never leak our temp dirs into other test files.
const origPaiDir = process.env.PAI_DIR;
const origVault = process.env.PAI_VAULT_PATH;

let mod: typeof import("@pai-lib/persona-mode");

beforeAll(async () => {
	// Env must be set BEFORE importing the modules (load-time vault resolution).
	process.env.PAI_DIR = paiDir;
	process.env.PAI_VAULT_PATH = vaultDir;

	// Minimal Oren persona/journal at the registry's expected vault paths.
	const orenDir = join(vaultDir, "_System/Daemons/oren");
	mkdirSync(orenDir, { recursive: true });
	writeFileSync(
		join(orenDir, "persona.md"),
		"# Oren\n\nYou are Oren. A friend who pays attention.",
	);
	writeFileSync(
		join(orenDir, "journal.md"),
		"# Oren Journal\n\n## 2026-01-01 12:00\nNoticed something.",
	);

	mod = (await import(
		"@pai-lib/persona-mode"
	)) as typeof import("@pai-lib/persona-mode");
});

afterAll(() => {
	// Restore env so sibling test files (e.g. identity.test) see the real PAI_DIR.
	if (origPaiDir === undefined) delete process.env.PAI_DIR;
	else process.env.PAI_DIR = origPaiDir;
	if (origVault === undefined) delete process.env.PAI_VAULT_PATH;
	else process.env.PAI_VAULT_PATH = origVault;

	rmSync(paiDir, { recursive: true, force: true });
	rmSync(vaultDir, { recursive: true, force: true });
});

beforeEach(() => {
	// Isolation: each test starts with no active persona for SID.
	if (mod) mod.clearPersona(SID);
});

describe("persona-mode state machine", () => {
	it("starts with no active persona", () => {
		expect(mod.getActivePersona(SID)).toBeNull();
	});

	it("set → get returns the persona, scoped to the session", () => {
		mod.setActivePersona(SID, "oren");
		expect(mod.getActivePersona(SID)).toBe("oren");
		// A different session id is unaffected (per-terminal isolation).
		expect(mod.getActivePersona("other-session")).toBeNull();
	});

	it("clear removes the active persona", () => {
		mod.setActivePersona(SID, "oren");
		mod.clearPersona(SID);
		expect(mod.getActivePersona(SID)).toBeNull();
	});

	it("rejects an unknown persona name", () => {
		expect(() => mod.setActivePersona(SID, "gandalf")).toThrow();
	});

	it("treats a stale flag (>24h) as inactive", () => {
		const stale = { active: "oren", ts: Date.now() - 25 * 60 * 60 * 1000 };
		const dir = join(paiDir, "MEMORY/STATE/persona-mode");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${SID}.json`), JSON.stringify(stale));
		expect(mod.getActivePersona(SID)).toBeNull();
	});

	it("returns null for empty session id", () => {
		expect(mod.getActivePersona("")).toBeNull();
	});
});

describe("buildPersonaReminder", () => {
	it("injects the persona voice and forbids the algorithm", () => {
		const reminder = mod.buildPersonaReminder("oren");
		expect(reminder).not.toBeNull();
		expect(reminder).toContain("PERSONA MODE: Oren");
		expect(reminder).toContain("You are Oren");
		// The crucial regression assertion: no builder algorithm MANDATE leaks.
		// (The reminder deliberately *instructs against* the algorithm, e.g.
		// "NO 7-phase algorithm" — so we assert the mandate header is absent.)
		expect(reminder).not.toContain("FULL PAI ALGORITHM");
		expect(reminder).not.toContain("MANDATORY OUTPUT STRUCTURE");
	});

	it("includes journal continuity when present", () => {
		const reminder = mod.buildPersonaReminder("oren");
		expect(reminder).toContain("Noticed something.");
	});

	it("returns null for an unknown persona", () => {
		expect(mod.buildPersonaReminder("gandalf")).toBeNull();
	});
});
