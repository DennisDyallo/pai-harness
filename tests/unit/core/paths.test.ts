import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	resolveHooksDir,
	resolveMemoryDir,
	resolvePaiDir,
	resolveProjectsDir,
	resolveSettingsPath,
} from "../../../src/core/paths";

describe("resolvePaiDir", () => {
	const origConfigDir = process.env.CLAUDE_CONFIG_DIR;
	const origPaiDir = process.env.PAI_DIR;

	afterEach(() => {
		if (origConfigDir !== undefined) {
			process.env.CLAUDE_CONFIG_DIR = origConfigDir;
		} else {
			delete process.env.CLAUDE_CONFIG_DIR;
		}
		if (origPaiDir !== undefined) {
			process.env.PAI_DIR = origPaiDir;
		} else {
			delete process.env.PAI_DIR;
		}
	});

	it("prefers CLAUDE_CONFIG_DIR over PAI_DIR", () => {
		process.env.CLAUDE_CONFIG_DIR = "/tmp/test-config";
		process.env.PAI_DIR = "/tmp/test-pai";
		expect(resolvePaiDir()).toBe("/tmp/test-config");
	});

	it("falls back to PAI_DIR when CLAUDE_CONFIG_DIR is unset", () => {
		delete process.env.CLAUDE_CONFIG_DIR;
		process.env.PAI_DIR = "/tmp/test-pai";
		expect(resolvePaiDir()).toBe("/tmp/test-pai");
	});

	it("falls back to ~/.claude when both env vars are unset", () => {
		delete process.env.CLAUDE_CONFIG_DIR;
		delete process.env.PAI_DIR;
		expect(resolvePaiDir()).toBe(join(homedir(), ".claude"));
	});

	it("treats empty CLAUDE_CONFIG_DIR as unset", () => {
		process.env.CLAUDE_CONFIG_DIR = "";
		process.env.PAI_DIR = "/tmp/test-pai";
		expect(resolvePaiDir()).toBe("/tmp/test-pai");
	});
});

describe("derived paths", () => {
	beforeEach(() => {
		process.env.CLAUDE_CONFIG_DIR = "/tmp/test-paths";
	});

	afterEach(() => {
		delete process.env.CLAUDE_CONFIG_DIR;
	});

	it("resolveHooksDir appends /hooks", () => {
		expect(resolveHooksDir()).toBe("/tmp/test-paths/hooks");
	});

	it("resolveSettingsPath appends /settings.json", () => {
		expect(resolveSettingsPath()).toBe("/tmp/test-paths/settings.json");
	});

	it("resolveProjectsDir appends /projects", () => {
		expect(resolveProjectsDir()).toBe("/tmp/test-paths/projects");
	});

	it("resolveMemoryDir appends /MEMORY", () => {
		expect(resolveMemoryDir()).toBe("/tmp/test-paths/MEMORY");
	});
});
