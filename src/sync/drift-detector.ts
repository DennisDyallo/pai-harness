/**
 * Drift Detector — compare config source vs live hooks
 *
 * Diffs files between source directory (discovered via symlinks) and ~/.claude/hooks/
 * to detect sync drift. Scans recursively to include lib/ and handlers/ subdirectories.
 */

import {
	existsSync,
	lstatSync,
	readdirSync,
	readFileSync,
	readlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveHooksDir } from "../core/paths";

export interface FileDiff {
	file: string;
	status: "identical" | "modified" | "source-only" | "live-only";
}

export interface DriftReport {
	sourceDir: string;
	liveDir: string;
	files: FileDiff[];
	identical: string[];
	modified: string[];
	added: string[]; // in live but not source (live-only)
	removed: string[]; // in source but not live (source-only)
	hasDrift: boolean;
}

/**
 * Resolve source directory by following symlinks in the live hooks directory.
 * Falls back to known locations if no symlinks are found.
 */
function resolveSourceDir(liveDir: string): string | null {
	// Check if any hook file in liveDir is a symlink
	try {
		const files = readdirSync(liveDir);
		for (const file of files) {
			const fullPath = join(liveDir, file);
			const stats = lstatSync(fullPath);
			if (stats.isSymbolicLink()) {
				const target = readlinkSync(fullPath);
				// Resolve to absolute path
				const absTarget = resolve(liveDir, target);
				// Return the directory containing the symlink target
				return dirname(absTarget);
			}
		}
	} catch {
		// Ignore errors reading directory
	}

	// Fallback: check known locations
	const knownPaths = [
		join(homedir(), "Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/Hooks"),
		join(homedir(), "Code/pai-private/config/hooks"),
	];
	for (const p of knownPaths) {
		if (existsSync(p)) return p;
	}

	return null;
}

/**
 * Recursively list all .ts and .json files in a directory.
 */
function listFilesRecursive(
	dir: string,
	relativeTo: string = dir,
	maxDepth = 5,
): string[] {
	const files: string[] = [];

	function walk(current: string, depth: number) {
		if (depth > maxDepth) return;
		try {
			for (const entry of readdirSync(current, { withFileTypes: true })) {
				const fullPath = join(current, entry.name);
				if (entry.isDirectory()) {
					walk(fullPath, depth + 1);
				} else if (
					entry.isFile() &&
					(entry.name.endsWith(".ts") || entry.name.endsWith(".json"))
				) {
					const relPath = fullPath.substring(relativeTo.length + 1);
					files.push(relPath);
				}
			}
		} catch {
			// Ignore unreadable directories
		}
	}

	walk(dir, 0);
	return files;
}

export function detectDrift(sourceDir?: string, liveDir?: string): DriftReport {
	const live = liveDir ?? resolveHooksDir();

	// Resolve source directory via symlinks if not provided
	const src =
		sourceDir ??
		resolveSourceDir(live) ??
		join(homedir(), "Code", "pai-private", "config", "hooks");

	const report: DriftReport = {
		sourceDir: src,
		liveDir: live,
		files: [],
		identical: [],
		modified: [],
		added: [],
		removed: [],
		hasDrift: false,
	};

	// Recursively list all files in both directories
	const sourceFiles = existsSync(src) ? listFilesRecursive(src) : [];
	const liveFiles = existsSync(live) ? listFilesRecursive(live) : [];

	const allFiles = [...new Set([...sourceFiles, ...liveFiles])].sort();

	for (const file of allFiles) {
		const inSource = sourceFiles.includes(file);
		const inLive = liveFiles.includes(file);

		if (inSource && inLive) {
			const sourceContent = readFileSync(join(src, file), "utf-8");
			const liveContent = readFileSync(join(live, file), "utf-8");
			if (sourceContent === liveContent) {
				report.files.push({ file, status: "identical" });
				report.identical.push(file);
			} else {
				report.files.push({ file, status: "modified" });
				report.modified.push(file);
			}
		} else if (inSource && !inLive) {
			report.files.push({ file, status: "source-only" });
			report.removed.push(file);
		} else {
			report.files.push({ file, status: "live-only" });
			report.added.push(file);
		}
	}

	report.hasDrift =
		report.modified.length > 0 ||
		report.added.length > 0 ||
		report.removed.length > 0;
	return report;
}

export function formatDriftReport(report: DriftReport): string {
	const lines: string[] = [
		"Drift Report",
		"=".repeat(50),
		`Source: ${report.sourceDir}`,
		`Live:   ${report.liveDir}`,
		"",
	];

	if (!report.hasDrift) {
		lines.push("No drift detected. All files in sync.");
		return lines.join("\n");
	}

	if (report.identical.length) {
		lines.push(
			`Identical (${report.identical.length}): ${report.identical.join(", ")}`,
		);
	}
	if (report.modified.length) {
		lines.push(
			`Modified  (${report.modified.length}): ${report.modified.join(", ")}`,
		);
	}
	if (report.added.length) {
		lines.push(
			`Live-only (${report.added.length}): ${report.added.join(", ")}`,
		);
	}
	if (report.removed.length) {
		lines.push(
			`Source-only (${report.removed.length}): ${report.removed.join(", ")}`,
		);
	}

	return lines.join("\n");
}
