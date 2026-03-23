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

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function analyzeContextBudget(
	pieces: ContextPiece[],
	budgetTokens: number = DEFAULT_BUDGET,
): ContextBudget {
	const totalTokens = estimateTokens(pieces.map((p) => p.content).join(""));

	const piecesWithTokens: ContextPieceWithTokens[] = pieces.map((p) => {
		const estimatedTokens = estimateTokens(p.content);
		return {
			...p,
			estimatedTokens,
			percentage: totalTokens > 0 ? (estimatedTokens / totalTokens) * 100 : 0,
		};
	});

	return {
		pieces: piecesWithTokens,
		totalTokens,
		budgetTokens,
		utilizationPercent: (totalTokens / budgetTokens) * 100,
	};
}

export function formatBudgetTable(budget: ContextBudget): string {
	const lines: string[] = [
		"Context Budget Analysis",
		"=".repeat(60),
		"",
		`${"Source".padEnd(35)} ${"Tokens".padStart(8)} ${"%".padStart(6)}`,
		"-".repeat(60),
	];

	for (const piece of budget.pieces.sort(
		(a, b) => b.estimatedTokens - a.estimatedTokens,
	)) {
		const name =
			piece.source.length > 34
				? `${piece.source.slice(0, 31)}...`
				: piece.source;
		lines.push(
			`${name.padEnd(35)} ${piece.estimatedTokens.toLocaleString().padStart(8)} ${piece.percentage.toFixed(1).padStart(5)}%`,
		);
	}

	lines.push("-".repeat(60));
	lines.push(
		`${"TOTAL".padEnd(35)} ${budget.totalTokens.toLocaleString().padStart(8)} ${budget.utilizationPercent.toFixed(1).padStart(5)}%`,
	);
	lines.push(
		`${"Budget".padEnd(35)} ${budget.budgetTokens.toLocaleString().padStart(8)}`,
	);
	lines.push("");

	if (budget.utilizationPercent > 80) {
		lines.push("WARNING: Context utilization above 80%!");
	} else if (budget.utilizationPercent > 50) {
		lines.push("Note: Context utilization above 50%.");
	}

	return lines.join("\n");
}
