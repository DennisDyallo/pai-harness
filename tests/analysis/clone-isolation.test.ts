import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { assembleContext } from "../../src/analyzers/context-assembly";
import { createSandbox } from "../../src/core/sandbox";
import type { Sandbox } from "../../src/core/types";

describe("Full-fidelity clone — isolation", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		// Clone BUILD phase — this legitimately reads live ~/.claude once.
		sandbox = createSandbox({ cloneFromProduction: true });
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	test("clone writes a sanitized settings.json into the sandbox", () => {
		const settingsPath = join(sandbox.dir, "settings.json");
		expect(existsSync(settingsPath)).toBe(true);
		const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
		expect(typeof settings).toBe("object");
	});

	test("clone writes a synthetic .claude.json with only mcpServers", () => {
		const claudeJson = join(sandbox.dir, ".claude.json");
		expect(existsSync(claudeJson)).toBe(true);
		const parsed = JSON.parse(readFileSync(claudeJson, "utf-8"));
		// Only the mcpServers block should be present (no 80+ live keys)
		expect(Object.keys(parsed)).toEqual(["mcpServers"]);
	});

	test("clone HOME env points at the sandbox dir", () => {
		expect(sandbox.env.HOME).toBe(sandbox.dir);
		expect(sandbox.env.CLAUDE_CONFIG_DIR).toBe(sandbox.dir);
		expect(sandbox.env.PAI_DIR).toBe(sandbox.dir);
	});

	test("no API-key-like secrets survive into the clone", () => {
		const settings = readFileSync(join(sandbox.dir, "settings.json"), "utf-8");
		const claudeJson = readFileSync(join(sandbox.dir, ".claude.json"), "utf-8");
		const settingsObj = JSON.parse(settings);
		if (settingsObj.env) {
			for (const [key, val] of Object.entries(settingsObj.env)) {
				if (
					typeof val === "string" &&
					(key.includes("API_KEY") ||
						key.includes("TOKEN") ||
						key.includes("SECRET"))
				) {
					expect(val).toBe("TEST_VALUE_REDACTED");
				}
			}
		}
		expect(() => JSON.parse(claudeJson)).not.toThrow();
	});

	test("CRITICAL: measured RUN reads ZERO bytes from live ~/.claude", () => {
		// The measured RUN (not the build) must read only the clone. We prove
		// this via the assembler's own read-path recorder — a real proof, since
		// the recorder is populated by the same readFileSync calls that produce
		// the pieces (no fragile in-process fs monkeypatch, which Bun's ESM bound
		// imports defeat anyway).
		const recordedReads: string[] = [];
		const pieces = assembleContext(sandbox.dir, recordedReads);

		// 1. PROVE the instrument is not vacuous: it MUST have recorded reads,
		//    and at least one must be a known clone file.
		expect(recordedReads.length).toBeGreaterThan(0);
		const cloneSettings = resolve(sandbox.dir, "settings.json");
		expect(recordedReads.map((p) => resolve(p))).toContain(cloneSettings);

		// 2. Assembly actually produced pieces.
		expect(pieces.length).toBeGreaterThan(0);

		// 3. No recorded read is under live ~/.claude (and not the clone).
		const liveClaude = resolve(homedir(), ".claude");
		const cloneRoot = resolve(sandbox.dir);
		for (const p of recordedReads) {
			const abs = resolve(p);
			expect(abs.startsWith(cloneRoot)).toBe(true);
			expect(abs.startsWith(liveClaude) && !abs.startsWith(cloneRoot)).toBe(
				false,
			);
		}

		// 4. Cross-check via the pieces' own resolvedPath fields.
		for (const piece of pieces) {
			if (piece.resolvedPath) {
				expect(resolve(piece.resolvedPath).startsWith(cloneRoot)).toBe(true);
			}
		}
	});

	test("CRITICAL (subprocess): out-of-process RUN reads ZERO bytes from live ~/.claude", async () => {
		// Strongest proof: run assembly in a SUBPROCESS with env pointed at the
		// clone. No shared in-process state could mask a live read. The runner
		// prints every recorded absolute read path; we assert none are live.
		const runner = join(
			import.meta.dir,
			"../fixtures/assemble-and-report-reads.ts",
		);
		const proc = Bun.spawn(["bun", runner, sandbox.dir], {
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...(process.env as Record<string, string>),
				HOME: sandbox.dir,
				CLAUDE_CONFIG_DIR: sandbox.dir,
				PAI_DIR: sandbox.dir,
			},
		});
		await proc.exited;
		const out = await new Response(proc.stdout).text();
		const parsed = JSON.parse(out) as {
			recordedReads: string[];
			pieceCount: number;
			resolvedPaths: string[];
		};

		expect(parsed.pieceCount).toBeGreaterThan(0);
		expect(parsed.recordedReads.length).toBeGreaterThan(0);

		const liveClaude = resolve(homedir(), ".claude");
		const cloneRoot = resolve(sandbox.dir);
		for (const p of parsed.recordedReads) {
			const abs = resolve(p);
			expect(abs.startsWith(cloneRoot)).toBe(true);
			expect(abs.startsWith(liveClaude) && !abs.startsWith(cloneRoot)).toBe(
				false,
			);
		}
	});

	test("recorder captures the LoadContext-injected SKILL.md from the clone", () => {
		const recordedReads: string[] = [];
		assembleContext(sandbox.dir, recordedReads);
		const skillMd = resolve(sandbox.dir, "skills/PAI/SKILL.md");
		// SKILL.md exists in the clone and is read during the run.
		if (existsSync(skillMd)) {
			expect(recordedReads.map((p) => resolve(p))).toContain(skillMd);
		}
	});

	test("clone includes LoadContext injection pieces (full SKILL.md body)", () => {
		const pieces = assembleContext(sandbox.dir);
		const inj = pieces.find(
			(p) => p.source === "LoadContext injection: skills/PAI/SKILL.md",
		);
		expect(inj).toBeDefined();
		expect(inj?.chars ?? 0).toBeGreaterThan(0);
	});

	test("clone includes skill descriptions in assembled context", () => {
		const pieces = assembleContext(sandbox.dir);
		const skillPiece = pieces.find((p) =>
			p.source.startsWith("skill descriptions"),
		);
		expect(skillPiece).toBeDefined();
		expect(skillPiece?.chars ?? 0).toBeGreaterThan(0);
	});
});
