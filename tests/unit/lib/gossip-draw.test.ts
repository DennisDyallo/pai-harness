/**
 * gossip-draw.test.ts — Terminal-side gossip DRAW (node:fs only, NO inference).
 *
 * Exercises the live ~/.claude/hooks/lib/gossip-draw.ts (via @pai-lib) against a
 * temp gossip dir, with an injected rng for determinism. Mirrors the daemon-side
 * gossip draw guarantees so the SHARED draw logic is covered on both surfaces:
 *   - excludes items authored by the requesting persona
 *   - skips items already in seen-<persona>.json
 *   - respects the receive policy and the probability roll
 *   - performs NO inference (it cannot — node:fs only)
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	atomicWrite,
	drawGossip,
	type GossipItem,
	withGossipLock,
} from "@pai-lib/gossip-draw";

let dir: string;
const always = () => 0;
const never = () => 1;

function item(id: string, from: string, text = `gossip ${id}`): GossipItem {
	return { id, from, ts: new Date().toISOString(), text };
}

function writePool(items: GossipItem[]): void {
	writeFileSync(
		join(dir, "pool.jsonl"),
		`${items.map((i) => JSON.stringify(i)).join("\n")}\n`,
	);
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "harness-gossip-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("drawGossip", () => {
	it("returns null on an empty pool", () => {
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toBeNull();
	});

	it("excludes items authored by the requesting persona", () => {
		writePool([item("1", "oren"), item("2", "oren")]);
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toBeNull();
	});

	it("draws an item authored by a different persona and marks it seen", () => {
		writePool([item("1", "sia", "the coast trip happened")]);
		const first = drawGossip("oren", { receive: true }, 1.0, dir, always);
		expect(first).toContain("coast trip");
		// Once seen, it is not drawn again.
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toBeNull();
		expect(existsSync(join(dir, "seen-oren.json"))).toBe(true);
	});

	it("skips seen items and walks back to older unseen ones", () => {
		writePool([item("1", "sia", "first"), item("2", "sia", "second")]);
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toContain(
			"second",
		);
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toContain(
			"first",
		);
		expect(drawGossip("oren", { receive: true }, 1.0, dir, always)).toBeNull();
	});

	it("returns null when receive policy is false", () => {
		writePool([item("1", "sia")]);
		expect(drawGossip("oren", { receive: false }, 1.0, dir, always)).toBeNull();
	});

	it("returns null (and writes no seen state) when the roll fails", () => {
		writePool([item("1", "sia")]);
		expect(drawGossip("oren", { receive: true }, 0.5, dir, never)).toBeNull();
		expect(existsSync(join(dir, "seen-oren.json"))).toBe(false);
	});
});

describe("withGossipLock + atomicWrite (terminal-side, fix #2)", () => {
	it("runs the critical section and releases the lock", () => {
		const out = withGossipLock(dir, () => {
			expect(existsSync(join(dir, ".gossip.lock"))).toBe(true);
			return "done";
		});
		expect(out).toBe("done");
		expect(existsSync(join(dir, ".gossip.lock"))).toBe(false);
	});

	it("releases the lock even when the body throws", () => {
		expect(() =>
			withGossipLock(dir, () => {
				throw new Error("boom");
			}),
		).toThrow("boom");
		expect(existsSync(join(dir, ".gossip.lock"))).toBe(false);
	});

	it("atomicWrite persists final content and leaves no temp files", () => {
		const target = join(dir, "out.json");
		atomicWrite(target, JSON.stringify({ ok: 1 }));
		const { readFileSync, readdirSync } = require("node:fs");
		expect(JSON.parse(readFileSync(target, "utf-8"))).toEqual({ ok: 1 });
		expect(
			readdirSync(dir).filter((f: string) => f.endsWith(".tmp")).length,
		).toBe(0);
	});

	it("release does NOT delete a lock owned by a different token (fix #1)", () => {
		const { writeFileSync, readFileSync, readdirSync } = require("node:fs");
		const lp = join(dir, ".gossip.lock");
		// Hold the lock, but mid-section another process re-takes it (overwrites
		// the lock file with ITS own token). Our release must not delete it.
		withGossipLock(dir, () => {
			writeFileSync(lp, "some-other-owner-token");
		});
		// The foreign-owned lock survives our release.
		expect(existsSync(lp)).toBe(true);
		expect(readFileSync(lp, "utf-8")).toBe("some-other-owner-token");
		// No temp/.tmp litter either.
		expect(
			readdirSync(dir).filter((f: string) => f.endsWith(".tmp")).length,
		).toBe(0);
	});

	it("atomicWrite failure leaves no .tmp behind (fix #2)", () => {
		const { mkdirSync, readdirSync } = require("node:fs");
		// Target is an EXISTING directory: the temp file (a sibling of the target)
		// is written successfully in `dir`, but renameSync(tmp → existing dir)
		// fails. The catch/cleanup must unlink the leftover temp.
		const badTarget = join(dir, "i-am-a-directory");
		mkdirSync(badTarget, { recursive: true });
		expect(() => atomicWrite(badTarget, "data")).toThrow();
		// `dir` must be clear of leftover *.tmp files after the failed write.
		expect(
			readdirSync(dir).filter((f: string) => f.endsWith(".tmp")).length,
		).toBe(0);
	});
});
