import { describe, expect, test } from "bun:test";
import type { ContextPiece } from "../../src/analyzers/context-tokens";
import {
	analyzeContextBudget,
	estimateTokens,
	formatBudgetTable,
} from "../../src/analyzers/context-tokens";

describe("Token Estimation", () => {
	test("estimates tokens using ~3.5 chars/token heuristic", () => {
		const tokens = estimateTokens("Hello world"); // 11 chars
		expect(tokens).toBe(Math.ceil(11 / 3.5)); // 4
	});

	test("returns 0 tokens for empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	test("handles long text reasonably", () => {
		const longText = "a".repeat(10000);
		const tokens = estimateTokens(longText);
		// Should be ~2857 tokens (10000/3.5)
		expect(tokens).toBeGreaterThan(2800);
		expect(tokens).toBeLessThan(2900);
	});

	test("rough accuracy for English text", () => {
		// Average English word is ~5 chars, ~1.3 tokens
		// 100 words => ~500 chars => ~143 tokens
		const text = "The quick brown fox jumps over the lazy dog. ".repeat(11); // ~495 chars
		const tokens = estimateTokens(text);
		expect(tokens).toBeGreaterThan(100);
		expect(tokens).toBeLessThan(200);
	});
});

describe("Context Budget Analysis", () => {
	const samplePieces: ContextPiece[] = [
		{ source: "CLAUDE.md", content: "x".repeat(3500), chars: 3500 },
		{ source: "MEMORY.md", content: "y".repeat(1750), chars: 1750 },
		{ source: "LoadContext", content: "z".repeat(7000), chars: 7000 },
	];

	test("calculates total tokens", () => {
		const budget = analyzeContextBudget(samplePieces);
		expect(budget.totalTokens).toBeGreaterThan(0);
		expect(budget.budgetTokens).toBe(200000);
	});

	test("calculates utilization percentage", () => {
		const budget = analyzeContextBudget(samplePieces);
		// Total chars ~12250, tokens ~3500, utilization ~1.75%
		expect(budget.utilizationPercent).toBeGreaterThan(0);
		expect(budget.utilizationPercent).toBeLessThan(10);
	});

	test("each piece has token estimate and percentage", () => {
		const budget = analyzeContextBudget(samplePieces);
		expect(budget.pieces.length).toBe(3);
		for (const piece of budget.pieces) {
			expect(piece.estimatedTokens).toBeGreaterThan(0);
			expect(piece.percentage).toBeGreaterThan(0);
		}
	});

	test("percentages sum to approximately 100", () => {
		const budget = analyzeContextBudget(samplePieces);
		const totalPct = budget.pieces.reduce((sum, p) => sum + p.percentage, 0);
		// Allow some rounding tolerance due to independent estimation
		expect(totalPct).toBeGreaterThan(95);
		expect(totalPct).toBeLessThan(105);
	});

	test("custom budget tokens", () => {
		const budget = analyzeContextBudget(samplePieces, 5000);
		expect(budget.budgetTokens).toBe(5000);
		// With small budget, utilization should be higher
		expect(budget.utilizationPercent).toBeGreaterThan(50);
	});

	test("handles empty pieces", () => {
		const budget = analyzeContextBudget([]);
		expect(budget.totalTokens).toBe(0);
		expect(budget.utilizationPercent).toBe(0);
		expect(budget.pieces).toEqual([]);
	});
});

describe("Budget Table Formatting", () => {
	test("produces formatted output", () => {
		const budget = analyzeContextBudget([
			{ source: "CLAUDE.md", content: "test content", chars: 12 },
		]);
		const table = formatBudgetTable(budget);
		expect(table).toContain("Context Budget Analysis");
		expect(table).toContain("CLAUDE.md");
		expect(table).toContain("TOTAL");
		expect(table).toContain("Budget");
	});

	test("shows warning for high utilization", () => {
		const hugePiece: ContextPiece = {
			source: "huge",
			content: "x".repeat(600000),
			chars: 600000,
		};
		const budget = analyzeContextBudget([hugePiece]);
		const table = formatBudgetTable(budget);
		expect(table).toContain("WARNING");
	});
});
