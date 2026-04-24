/**
 * Settings Validator — validate settings.json structure and hook references
 */

import { existsSync, readFileSync } from "node:fs";

export interface ValidationIssue {
	severity: "error" | "warning";
	field: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
	hookCount: number;
	sectionsFound: string[];
	learnedSchema?: LearnedSchema;
}

export interface LearnedSchema {
	topLevelKeys: Map<string, string>; // key → detected type
	hookEvents: string[];
	requiredSections: string[];
	warnings: string[];
}

const MINIMAL_REQUIRED = ["hooks", "permissions"];

interface HookEntry {
	type: string;
	command: string;
}

interface HookGroup {
	matcher?: string;
	hooks: HookEntry[];
}

/**
 * Learn the schema from the settings file itself instead of comparing against
 * a static expected schema. This adapts to production evolution.
 */
function learnSchema(settings: Record<string, unknown>): LearnedSchema {
	const topLevelKeys = new Map<string, string>();

	for (const [key, value] of Object.entries(settings)) {
		if (value === null) {
			topLevelKeys.set(key, "null");
		} else if (Array.isArray(value)) {
			topLevelKeys.set(key, "array");
		} else {
			topLevelKeys.set(key, typeof value);
		}
	}

	// Deep validate hooks structure
	const hookEvents: string[] = [];
	if (settings.hooks && typeof settings.hooks === "object") {
		for (const event of Object.keys(settings.hooks as object)) {
			hookEvents.push(event);
		}
	}

	const warnings: string[] = [];

	// Check for unexpected top-level types (values that should be objects but aren't)
	if (settings.hooks && typeof settings.hooks !== "object") {
		warnings.push("hooks should be an object");
	}
	if (settings.permissions && typeof settings.permissions !== "object") {
		warnings.push("permissions should be an object");
	}

	return {
		topLevelKeys,
		hookEvents,
		requiredSections: MINIMAL_REQUIRED,
		warnings,
	};
}

export function validateSettings(settingsPath: string): ValidationResult {
	const issues: ValidationIssue[] = [];
	let hookCount = 0;
	const sectionsFound: string[] = [];

	if (!existsSync(settingsPath)) {
		issues.push({
			severity: "error",
			field: "root",
			message: `Settings file not found: ${settingsPath}`,
		});
		return { valid: false, issues, hookCount, sectionsFound };
	}

	let settings: Record<string, unknown>;
	try {
		settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
	} catch (e) {
		issues.push({
			severity: "error",
			field: "root",
			message: `Invalid JSON: ${(e as Error).message}`,
		});
		return { valid: false, issues, hookCount, sectionsFound };
	}

	// Learn the schema from the settings file
	const learnedSchema = learnSchema(settings);

	// Record all sections found
	sectionsFound.push(...learnedSchema.topLevelKeys.keys());

	// Check minimal required sections
	for (const section of MINIMAL_REQUIRED) {
		if (!(section in settings)) {
			issues.push({
				severity: "error",
				field: section,
				message: `Required section '${section}' is missing`,
			});
		}
	}

	// Add schema warnings as validation warnings
	for (const warning of learnedSchema.warnings) {
		issues.push({
			severity: "warning",
			field: "schema",
			message: warning,
		});
	}

	// Validate hooks — check that commands point to existing files
	if (settings.hooks && typeof settings.hooks === "object") {
		const hooks = settings.hooks as Record<string, HookGroup[]>;
		for (const [eventName, groups] of Object.entries(hooks)) {
			if (!Array.isArray(groups)) {
				issues.push({
					severity: "error",
					field: `hooks.${eventName}`,
					message: "Must be an array of hook groups",
				});
				continue;
			}
			for (const group of groups) {
				if (!group.hooks || !Array.isArray(group.hooks)) continue;
				for (const hook of group.hooks) {
					hookCount++;
					if (hook.type !== "command") {
						issues.push({
							severity: "warning",
							field: `hooks.${eventName}`,
							message: `Unknown hook type: ${hook.type}`,
						});
						continue;
					}
					// Extract file path from command like "bun $HOME/.claude/hooks/Foo.hook.ts"
					const cmdParts = hook.command.split(/\s+/);
					const filePart = cmdParts.find(
						(p) =>
							p.includes(".hook.ts") || p.includes(".ts") || p.includes(".js"),
					);
					if (filePart) {
						const resolved = filePart
							.replace(/\$HOME/g, process.env.HOME ?? "")
							.replace(/\$\{HOME\}/g, process.env.HOME ?? "")
							.replace(/~\//g, `${process.env.HOME ?? ""}/`);
						if (!existsSync(resolved)) {
							issues.push({
								severity: "error",
								field: `hooks.${eventName}`,
								message: `Hook file not found: ${filePart} (resolved: ${resolved})`,
							});
						}
					}
				}
			}
		}
	}

	// Validate permissions
	if (settings.permissions && typeof settings.permissions === "object") {
		const perms = settings.permissions as Record<string, unknown>;
		if (perms.allow && !Array.isArray(perms.allow)) {
			issues.push({
				severity: "error",
				field: "permissions.allow",
				message: "Must be an array",
			});
		}
		if (perms.deny && !Array.isArray(perms.deny)) {
			issues.push({
				severity: "error",
				field: "permissions.deny",
				message: "Must be an array",
			});
		}
	}

	const hasErrors = issues.some((i) => i.severity === "error");
	return { valid: !hasErrors, issues, hookCount, sectionsFound, learnedSchema };
}
