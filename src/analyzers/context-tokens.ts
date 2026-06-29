/**
 * Context Tokens — token estimation for context budget analysis
 */

import type { ContextPiece } from "./context-assembly";

export type { ContextPiece };

export interface ContextPieceWithTokens extends ContextPiece {
	estimatedTokens: number;
	percentage: number;
}

export interface ContextBudget {
	pieces: ContextPieceWithTokens[];
	totalTokens: number;
	budgetTokens: number;
	utilizationPercent: number;
}

const CHARS_PER_TOKEN = 3.5;
const DEFAULT_BUDGET = 200_000;

/**
 * Estimate tokens from text length using the 3.5 chars/token baseline.
 *
 * `calibrationFactor` (default 1.0) scales the baseline estimate so real
 * `/context` numbers can be calibrated later without changing the baseline —
 * e.g. a factor of 1.1 means the heuristic was undercounting by ~10%.
 */
export function estimateTokens(text: string, calibrationFactor = 1.0): number {
	return Math.ceil((text.length / CHARS_PER_TOKEN) * calibrationFactor);
}

export function analyzeContextBudget(
	pieces: ContextPiece[],
	budgetTokens: number = DEFAULT_BUDGET,
	calibrationFactor = 1.0,
): ContextBudget {
	const piecesWithTokens: ContextPieceWithTokens[] = pieces.map((p) => {
		const estimatedTokens = estimateTokens(p.content, calibrationFactor);
		return {
			...p,
			estimatedTokens,
			percentage: 0, // filled in below once the total is known
		};
	});

	// Total is the SUM of the per-piece (independently ceiled) estimates, so the
	// ranked table's cumulative column reconciles exactly with the total — rather
	// than re-estimating from concatenated content (which would round differently).
	const totalTokens = piecesWithTokens.reduce(
		(sum, p) => sum + p.estimatedTokens,
		0,
	);
	for (const p of piecesWithTokens) {
		p.percentage =
			totalTokens > 0 ? (p.estimatedTokens / totalTokens) * 100 : 0;
	}

	return {
		pieces: piecesWithTokens,
		totalTokens,
		budgetTokens,
		utilizationPercent: (totalTokens / budgetTokens) * 100,
	};
}

export function formatBudgetTable(budget: ContextBudget): string {
	const header = `${"#".padStart(3)}  ${"Source".padEnd(35)} ${"Chars".padStart(8)} ${"Tokens".padStart(8)} ${"%200K".padStart(7)} ${"Cum%".padStart(7)}`;
	const lines: string[] = [
		"Context Budget Analysis",
		"=".repeat(header.length),
		"",
		header,
		"-".repeat(header.length),
	];

	const sorted = [...budget.pieces].sort(
		(a, b) => b.estimatedTokens - a.estimatedTokens,
	);

	let cumulativeTokens = 0;
	let rank = 1;
	for (const piece of sorted) {
		cumulativeTokens += piece.estimatedTokens;
		const name =
			piece.source.length > 35
				? `${piece.source.slice(0, 32)}...`
				: piece.source;
		const pctOfBudget = (piece.estimatedTokens / budget.budgetTokens) * 100;
		const cumPctOfBudget = (cumulativeTokens / budget.budgetTokens) * 100;
		lines.push(
			`${String(rank).padStart(3)}  ${name.padEnd(35)} ${piece.chars.toLocaleString().padStart(8)} ${piece.estimatedTokens.toLocaleString().padStart(8)} ${pctOfBudget.toFixed(2).padStart(6)}% ${cumPctOfBudget.toFixed(2).padStart(6)}%`,
		);
		rank++;
	}

	lines.push("-".repeat(header.length));
	const totalChars = budget.pieces.reduce((s, p) => s + p.chars, 0);
	lines.push(
		`${"".padStart(3)}  ${"TOTAL".padEnd(35)} ${totalChars.toLocaleString().padStart(8)} ${budget.totalTokens.toLocaleString().padStart(8)} ${budget.utilizationPercent.toFixed(2).padStart(6)}%`,
	);
	lines.push(
		`${"".padStart(3)}  ${"Budget".padEnd(35)} ${"".padStart(8)} ${budget.budgetTokens.toLocaleString().padStart(8)}`,
	);
	lines.push("");

	if (budget.utilizationPercent > 80) {
		lines.push("WARNING: Context utilization above 80%!");
	} else if (budget.utilizationPercent > 50) {
		lines.push("Note: Context utilization above 50%.");
	}

	return lines.join("\n");
}
