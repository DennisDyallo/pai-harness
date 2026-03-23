/**
 * Drift Detector — compare config source vs live hooks
 *
 * Diffs files between ~/Code/pai-private/config/hooks/ and ~/.claude/hooks/
 * to detect sync drift.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export function detectDrift(sourceDir?: string, liveDir?: string): DriftReport {
	const src =
		sourceDir ??
		join(process.env.HOME ?? "", "Code", "pai-private", "config", "hooks");
	const live = liveDir ?? join(process.env.HOME ?? "", ".claude", "hooks");

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

	const sourceFiles = existsSync(src)
		? readdirSync(src).filter((f) => f.endsWith(".ts") || f.endsWith(".json"))
		: [];
	const liveFiles = existsSync(live)
		? readdirSync(live).filter((f) => f.endsWith(".ts") || f.endsWith(".json"))
		: [];

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
