import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	extractPackages,
	isInstallCommand,
} from "/Users/Dennis.Dyall/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Hooks/PackageAudit.hook";
import { makePreToolUseInput } from "../../../src/core/fixtures";
import { runHook } from "../../../src/core/runner";
import { createSandbox } from "../../../src/core/sandbox";
import type { Sandbox } from "../../../src/core/types";

const HOOK_PATH = `${process.env.HOME}/.claude/hooks/PackageAudit.hook.ts`;
const OFFLINE = process.env.PAI_HARNESS_OFFLINE === "1";

describe("PackageAudit — parser (pure, no network)", () => {
	describe("isInstallCommand", () => {
		it("recognizes plain installs", () => {
			expect(isInstallCommand("npm install lodash")).toBe(true);
			expect(isInstallCommand("bun add foo")).toBe(true);
			expect(isInstallCommand("yarn add bar")).toBe(true);
			expect(isInstallCommand("pnpm install baz")).toBe(true);
			expect(isInstallCommand("pip install requests")).toBe(true);
		});

		it("ignores non-install commands", () => {
			expect(isInstallCommand("echo hello")).toBe(false);
			expect(isInstallCommand("git status")).toBe(false);
			expect(isInstallCommand("npm run test")).toBe(false);
		});

		it("still recognizes install when redirection / pipe is appended", () => {
			expect(isInstallCommand("bun add foo 2>&1")).toBe(true);
			expect(isInstallCommand("bun add foo 2>&1 | tail -20")).toBe(true);
			expect(isInstallCommand("npm install lodash > /tmp/out.log 2>&1")).toBe(
				true,
			);
		});

		it("does not let a downstream piped 'echo install' word fool it", () => {
			expect(isInstallCommand("git log | grep install")).toBe(false);
		});
	});

	describe("extractPackages — Bug A: pipe boundary", () => {
		it("does not include tokens after a single pipe", () => {
			const { packages } = extractPackages(
				"bun add -D --exact @biomejs/biome 2>&1 | tail -20",
			);
			expect(packages).toEqual(["@biomejs/biome"]);
		});

		it("does not include grep/awk/etc after pipe in npm install", () => {
			const { packages } = extractPackages("npm install foo | grep bar");
			expect(packages).toEqual(["foo"]);
		});

		it("still splits on || (logical-or)", () => {
			const { packages } = extractPackages("npm install foo || echo failed");
			expect(packages).toEqual(["foo"]);
		});
	});

	describe("extractPackages — Bug B: shell redirection tokens", () => {
		it("ignores 2>&1", () => {
			const { packages } = extractPackages("bun add lodash 2>&1");
			expect(packages).toEqual(["lodash"]);
		});

		it("ignores > redirection and target", () => {
			const { packages } = extractPackages(
				"npm install lodash > /tmp/out.log 2>&1",
			);
			expect(packages).toEqual(["lodash"]);
		});

		it("ignores &> combined redirection", () => {
			const { packages } = extractPackages(
				"npm install lodash &> /tmp/out.log",
			);
			expect(packages).toEqual(["lodash"]);
		});

		it("ignores < input redirection", () => {
			const { packages } = extractPackages("pip install foo < requirements.in");
			expect(packages).toEqual(["foo"]);
		});
	});

	describe("extractPackages — happy path", () => {
		it("extracts a single unscoped package", () => {
			const { packages, ecosystem } = extractPackages("npm install lodash");
			expect(packages).toEqual(["lodash"]);
			expect(ecosystem).toBe("npm");
		});

		it("extracts a scoped package, stripping version", () => {
			const { packages } = extractPackages("bun add @types/node@18");
			expect(packages).toEqual(["@types/node"]);
		});

		it("extracts multiple packages", () => {
			const { packages } = extractPackages("npm install foo bar baz");
			expect(packages).toEqual(["foo", "bar", "baz"]);
		});

		it("strips version specifiers from unscoped packages", () => {
			const { packages } = extractPackages("npm install lodash@4.17.21");
			expect(packages).toEqual(["lodash"]);
		});

		it("ignores flags", () => {
			const { packages } = extractPackages(
				"bun add -D --exact --save-dev lodash",
			);
			expect(packages).toEqual(["lodash"]);
		});

		it("returns empty for install with no args (restore from manifest)", () => {
			const { packages } = extractPackages("npm install");
			expect(packages).toEqual([]);
		});

		it("detects pypi ecosystem", () => {
			const { packages, ecosystem } = extractPackages("pip install requests");
			expect(packages).toEqual(["requests"]);
			expect(ecosystem).toBe("pypi");
		});

		it("treats npx/bunx/uvx as runner — only first package, rest are args", () => {
			const { packages } = extractPackages("npx create-react-app my-app");
			expect(packages).toEqual(["create-react-app"]);
		});
	});
});

describe("PackageAudit — end-to-end (subprocess)", () => {
	let sandbox: Sandbox;

	beforeEach(() => {
		sandbox = createSandbox();
	});

	afterEach(() => {
		sandbox.cleanup();
	});

	it("passes through non-install commands (exit 0, continue:true)", async () => {
		const input = makePreToolUseInput("Bash", { command: "echo hello" });
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.parsedOutput?.continue).toBe(true);
	});

	it("passes through non-Bash tool calls", async () => {
		const input = makePreToolUseInput("Read", { file_path: "/tmp/x" });
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.parsedOutput?.continue).toBe(true);
	});

	it("passes through install with no args (restore from manifest)", async () => {
		const input = makePreToolUseInput("Bash", { command: "npm install" });
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.parsedOutput?.continue).toBe(true);
	});

	it("handles empty/missing command gracefully", async () => {
		const input = makePreToolUseInput("Bash", { command: "" });
		const result = await runHook({ hookPath: HOOK_PATH, input, sandbox });

		expect(result.exitCode).toBe(0);
		expect(result.parsedOutput?.continue).toBe(true);
	});

	it.skipIf(OFFLINE)(
		"Bug A regression: original failing command audits ONLY @biomejs/biome",
		async () => {
			const input = makePreToolUseInput("Bash", {
				command: "bun add -D --exact @biomejs/biome 2>&1 | tail -20",
			});
			const result = await runHook({
				hookPath: HOOK_PATH,
				input,
				sandbox,
				timeoutMs: 15000,
			});

			expect(result.stderr).toContain(
				"[PAI SECURITY] Package Audit: @biomejs/biome",
			);
			expect(result.stderr).not.toContain("Package Audit: tail");
			expect(result.stderr).not.toContain("Package Audit: 2>&1");
			expect(result.stderr).not.toContain("Package Audit: |");
			expect(result.exitCode).not.toBe(2);
		},
		20000,
	);

	it.skipIf(OFFLINE)(
		"Bug C regression: block message names actual signal, not generic string",
		async () => {
			const fakePkg = `pai-harness-nonexistent-${Date.now()}`;
			const input = makePreToolUseInput("Bash", {
				command: `npm install ${fakePkg}`,
			});
			const result = await runHook({
				hookPath: HOOK_PATH,
				input,
				sandbox,
				timeoutMs: 15000,
			});

			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain(fakePkg);
			expect(result.stderr).toContain("NOT FOUND IN REGISTRY");
			expect(result.stderr).not.toContain(
				"Package is too new or has zero downloads",
			);
		},
		20000,
	);
});
