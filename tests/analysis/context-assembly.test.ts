import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assembleContext,
	extractSkillDescription,
	extractStartupFiles,
	mcpCostsToPieces,
} from "../../src/analyzers/context-assembly";

describe("extractStartupFiles", () => {
	test("handles production {files:[]} shape", () => {
		const files = extractStartupFiles({
			files: ["a.md", "b.md"],
		});
		expect(files).toEqual(["a.md", "b.md"]);
	});

	test("tolerates legacy array shape", () => {
		const files = extractStartupFiles(["x.md", "y.md"]);
		expect(files).toEqual(["x.md", "y.md"]);
	});

	test("returns empty for undefined / unexpected shapes", () => {
		expect(extractStartupFiles(undefined)).toEqual([]);
		expect(extractStartupFiles(null)).toEqual([]);
		expect(extractStartupFiles({})).toEqual([]);
		expect(extractStartupFiles({ files: "nope" })).toEqual([]);
	});

	test("filters out non-string entries", () => {
		expect(extractStartupFiles({ files: ["ok.md", 42, null] })).toEqual([
			"ok.md",
		]);
	});
});

describe("extractSkillDescription", () => {
	test("extracts description from frontmatter", () => {
		const content = `---
name: Research
description: Comprehensive research skill.
---

body`;
		expect(extractSkillDescription(content)).toBe(
			"Comprehensive research skill.",
		);
	});

	test("returns empty string when no description", () => {
		const content = `---
name: NoDesc
---
body`;
		expect(extractSkillDescription(content)).toBe("");
	});

	test("returns empty string for non-frontmatter content", () => {
		expect(extractSkillDescription("just some text")).toBe("");
	});
});

describe("assembleContext — loadAtStartup {files:[]} fix", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `assembly-test-${Date.now()}-${Math.random()}`);
		mkdirSync(dir, { recursive: true });
	});

	afterEach(() => {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	});

	test("loads files referenced via {files:[]} (relative to PAI dir)", () => {
		mkdirSync(join(dir, "skills/PAI/USER"), { recursive: true });
		writeFileSync(
			join(dir, "skills/PAI/USER/DAIDENTITY.md"),
			"IDENTITY CONTENT",
		);
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({
				loadAtStartup: { files: ["skills/PAI/USER/DAIDENTITY.md"] },
			}),
		);

		const pieces = assembleContext(dir);
		const startupPiece = pieces.find((p) =>
			p.source.startsWith("loadAtStartup: "),
		);
		expect(startupPiece).toBeDefined();
		expect(startupPiece?.content).toBe("IDENTITY CONTENT");
	});

	test("models a dangling startup ref as a 0-char (missing) piece", () => {
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({
				loadAtStartup: { files: ["PAI/ALGORITHM-SUMMARY.md"] },
			}),
		);

		const pieces = assembleContext(dir);
		const missing = pieces.find((p) =>
			p.source.startsWith("loadAtStartup (missing): "),
		);
		expect(missing).toBeDefined();
		expect(missing?.chars).toBe(0);
	});

	test("still handles the legacy array shape", () => {
		writeFileSync(join(dir, "abs.md"), "ABS CONTENT");
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({ loadAtStartup: [join(dir, "abs.md")] }),
		);

		const pieces = assembleContext(dir);
		const piece = pieces.find((p) => p.source.startsWith("loadAtStartup: "));
		expect(piece?.content).toBe("ABS CONTENT");
	});
});

describe("assembleContext — skill descriptions", () => {
	let dir: string;

	beforeEach(() => {
		dir = join(tmpdir(), `assembly-skills-${Date.now()}-${Math.random()}`);
		mkdirSync(join(dir, "skills/Alpha"), { recursive: true });
		mkdirSync(join(dir, "skills/Beta"), { recursive: true });
		writeFileSync(
			join(dir, "skills/Alpha/SKILL.md"),
			"---\nname: Alpha\ndescription: Alpha does things.\n---\nbody",
		);
		writeFileSync(
			join(dir, "skills/Beta/SKILL.md"),
			"---\nname: Beta\ndescription: Beta does other things.\n---\nbody",
		);
		writeFileSync(join(dir, "settings.json"), "{}");
	});

	afterEach(() => {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	});

	test("aggregates skill descriptions into one piece", () => {
		const pieces = assembleContext(dir);
		const skillPiece = pieces.find((p) =>
			p.source.startsWith("skill descriptions"),
		);
		expect(skillPiece).toBeDefined();
		expect(skillPiece?.source).toContain("2 skills");
		expect(skillPiece?.content).toContain("Alpha does things.");
		expect(skillPiece?.content).toContain("Beta does other things.");
	});
});

describe("mcpCostsToPieces", () => {
	test("converts measured costs to pieces", () => {
		const pieces = mcpCostsToPieces([
			{ server: "chrome-devtools", chars: 1200, serialized: "[...]" },
		]);
		expect(pieces).toHaveLength(1);
		expect(pieces[0].source).toBe("MCP tools: chrome-devtools");
		expect(pieces[0].chars).toBe(1200);
	});

	test("marks failed measurements as unmeasured", () => {
		const pieces = mcpCostsToPieces([
			{ server: "vslsp", chars: 0, serialized: "[]", error: "timeout" },
		]);
		expect(pieces[0].source).toContain("unmeasured: timeout");
		expect(pieces[0].chars).toBe(0);
	});
});
