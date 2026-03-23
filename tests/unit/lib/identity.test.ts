import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import {
	clearCache,
	getDAName,
	getDefaultIdentity,
	getDefaultPrincipal,
	getIdentity,
	getPrincipal,
	getPrincipalName,
} from "../../../../../.claude/hooks/lib/identity";
import { getSettingsPath } from "../../../../../.claude/hooks/lib/paths";

// identity.ts computes SETTINGS_PATH = getSettingsPath() at module load time.
// When running with other test files, identity.ts may load before we can set
// CLAUDE_CONFIG_DIR, so SETTINGS_PATH points to the real ~/.claude/settings.json.
// We work around this by writing test settings to the ACTUAL settings path that
// identity.ts resolved, saving/restoring the original file.

const settingsPath = getSettingsPath();
let originalSettings: string | null = null;

describe("identity", () => {
	beforeEach(() => {
		clearCache();
		// Save original settings file if it exists
		if (originalSettings === null) {
			try {
				originalSettings = Bun.file(settingsPath).toString() || "";
				// Read synchronously
				const { readFileSync } = require("node:fs");
				originalSettings = readFileSync(settingsPath, "utf-8");
			} catch {
				originalSettings = "";
			}
		}
		// Write empty settings to isolate tests
		writeFileSync(settingsPath, "{}");
		clearCache();
	});

	afterEach(() => {
		clearCache();
		// Restore original settings
		if (originalSettings) {
			writeFileSync(settingsPath, originalSettings);
		}
	});

	describe("getIdentity", () => {
		it("returns defaults when settings has no identity", () => {
			writeFileSync(settingsPath, "{}");
			clearCache();

			const identity = getIdentity();
			const defaults = getDefaultIdentity();
			expect(identity.name).toBe(defaults.name);
			expect(identity.fullName).toBe(defaults.fullName);
			expect(identity.displayName).toBe(defaults.displayName);
			expect(identity.color).toBe(defaults.color);
		});

		it("reads identity from settings.json", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					daidentity: {
						name: "TestBot",
						fullName: "Test Bot Full",
						displayName: "TB",
						color: "#FF0000",
					},
				}),
			);
			clearCache();

			const identity = getIdentity();
			expect(identity.name).toBe("TestBot");
			expect(identity.fullName).toBe("Test Bot Full");
			expect(identity.displayName).toBe("TB");
			expect(identity.color).toBe("#FF0000");
		});

		it("falls back to env.DA for name when daidentity.name is missing", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					env: { DA: "EnvBot" },
				}),
			);
			clearCache();

			const identity = getIdentity();
			expect(identity.name).toBe("EnvBot");
		});
	});

	describe("getDAName", () => {
		it("returns the name from settings", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					daidentity: { name: "NamedBot" },
				}),
			);
			clearCache();

			expect(getDAName()).toBe("NamedBot");
		});

		it("returns default name when settings has no identity", () => {
			writeFileSync(settingsPath, "{}");
			clearCache();

			expect(getDAName()).toBe("PAI");
		});
	});

	describe("getPrincipal", () => {
		it("returns principal info from settings", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					principal: {
						name: "Alice",
						pronunciation: "AL-iss",
						timezone: "America/New_York",
					},
				}),
			);
			clearCache();

			const principal = getPrincipal();
			expect(principal.name).toBe("Alice");
			expect(principal.pronunciation).toBe("AL-iss");
			expect(principal.timezone).toBe("America/New_York");
		});

		it("returns defaults when principal is missing", () => {
			writeFileSync(settingsPath, "{}");
			clearCache();

			const principal = getPrincipal();
			const defaults = getDefaultPrincipal();
			expect(principal.name).toBe(defaults.name);
			expect(principal.timezone).toBe(defaults.timezone);
		});

		it("falls back to env.PRINCIPAL for name", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					env: { PRINCIPAL: "Bob" },
				}),
			);
			clearCache();

			expect(getPrincipal().name).toBe("Bob");
		});
	});

	describe("getPrincipalName", () => {
		it("returns the principal name", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					principal: { name: "Charlie" },
				}),
			);
			clearCache();

			expect(getPrincipalName()).toBe("Charlie");
		});
	});

	describe("clearCache", () => {
		it("causes re-read on next call", () => {
			writeFileSync(settingsPath, "{}");
			clearCache();

			// First read with empty settings
			expect(getDAName()).toBe("PAI");

			// Write settings and clear cache
			writeFileSync(
				settingsPath,
				JSON.stringify({
					daidentity: { name: "UpdatedBot" },
				}),
			);
			clearCache();

			// Should now read the new file
			expect(getDAName()).toBe("UpdatedBot");
		});

		it("returns stale data without clearCache", () => {
			writeFileSync(
				settingsPath,
				JSON.stringify({
					daidentity: { name: "First" },
				}),
			);
			clearCache();
			expect(getDAName()).toBe("First");

			// Update file but do NOT clear cache
			writeFileSync(
				settingsPath,
				JSON.stringify({
					daidentity: { name: "Second" },
				}),
			);

			// Should still return cached value
			expect(getDAName()).toBe("First");
		});
	});
});
