# Run 3 — Optional Patches (all OPTIONAL; not applied to clone or live)

These are documented-only. None were applied. Each is independent.

---

## 1. ALGORITHM-SUMMARY dead ref — ALTERNATIVE to removal (OPTIONAL)

**Applied in Run 3 (clone):** the dangling `"PAI/ALGORITHM-SUMMARY.md"` entry was **removed**
from `settings.json` → `loadAtStartup.files` (zero-token, de-bloat-aligned). The path did not
resolve (no `~/.claude/PAI/ALGORITHM-SUMMARY.md`), so it was a silent no-op load.

**Alternative (if Dennis WANTS the summary loaded at startup):** repoint instead of removing.
The real file is `~/.claude/skills/PAI/ALGORITHM-SUMMARY.md` (2,240 ch ≈ **640 tok**).

```jsonc
"loadAtStartup": {
  "files": [
    "skills/PAI/USER/DAIDENTITY.md",
    "skills/PAI/ALGORITHM-SUMMARY.md"   // repoint (adds ~640 always-on tokens)
  ]
}
```

⚠️ This **fights** the de-bloat goal (+640 tok always-on). Only do this if the summary is
genuinely wanted in every session's context. Default recommendation: keep it removed.

---

## 2. OPINIONS.md dead branch in LoadContext.hook.ts (BENIGN / OPTIONAL)

`~/.claude/hooks/LoadContext.hook.ts` reads `skills/PAI/USER/OPINIONS.md`, which **does not
exist**. The read is `existsSync`-guarded, so it is a **benign no-op** today — zero tokens,
no error. Removing it is pure cleanup, not a de-bloat win.

> NOT applied. The hook lives in `~/.claude/hooks/` (a LIVE file, not in the clone). Editing
> it is a live change and out of scope for clone-only work.

Optional cleanup patch (the whole `loadRelationshipContext` opinions block, lines ~148–175):

```diff
 function loadRelationshipContext(paiDir: string): string | null {
   const parts: string[] = [];

-  // Load high-confidence opinions (>0.85) from OPINIONS.md
-  const opinionsPath = join(paiDir, 'skills/PAI/USER/OPINIONS.md');
-  if (existsSync(opinionsPath)) {
-    try {
-      const content = readFileSync(opinionsPath, 'utf-8');
-      const highConfidence: string[] = [];
-
-      // Extract opinions with confidence >= 0.85
-      const opinionBlocks = content.split(/^### /gm).slice(1);
-      for (const block of opinionBlocks) {
-        const lines = block.split('\n');
-        const statement = lines[0]?.trim();
-        const confidenceMatch = block.match(/\*\*Confidence:\*\*\s*([\d.]+)/);
-        const confidence = confidenceMatch ? Number.parseFloat(confidenceMatch[1]) : 0;
-
-        if (confidence >= 0.85 && statement) {
-          highConfidence.push(`• ${statement} (${(confidence * 100).toFixed(0)}%)`);
-        }
-      }
-
-      if (highConfidence.length > 0) {
-        parts.push('**Key Opinions (high confidence):**');
-        parts.push(highConfidence.slice(0, 6).join('\n'));
-      }
-    } catch (err) {
-      console.error(`⚠️ Failed to load opinions: ${err}`);
-    }
-  }
-
   // Load recent relationship notes (today and yesterday)
```

Also update the footer reference on line ~217:

```diff
-*Full details: USER/OPINIONS.md, MEMORY/RELATIONSHIP/*
+*Full details: MEMORY/RELATIONSHIP/*
```

> If Dennis intends to CREATE an OPINIONS.md later, leave this branch as-is (it will start
> working the moment the file exists).

---

## 3. DAIDENTITY double-load de-dup (MINOR / OPTIONAL)

`skills/PAI/USER/DAIDENTITY.md` (8,527 ch ≈ **2,436 tok**) is loaded:
1. **Always**, via `settings.json` → `loadAtStartup.files`.
2. **Conditionally**, by `CapabilityRecommender.hook.ts` `loadIdentityFile()` when the depth
   classifier returns `identity_needed=true` (personal/coaching/"what do you think?" prompts).

So on identity-triggering prompts only, DAIDENTITY.md is injected **twice** (~2,436 tok of
duplication on those turns). On pure code/system prompts there is no double-load. This is
**minor and conditional**, not always-on bloat.

> NOT applied. `CapabilityRecommender.hook.ts` is a LIVE file (not in the clone); editing it
> is a live change and out of scope for clone-only work.

**De-dup option:** since `loadAtStartup` already injects DAIDENTITY.md every session, the
CapabilityRecommender re-injection is redundant. Drop the re-injection (let loadAtStartup own
it):

```diff
 function loadIdentityFile(): string | null {
+  // loadAtStartup.files already injects DAIDENTITY.md every session; re-injecting
+  // here duplicates ~2,436 tok on identity-triggering prompts. Return null to defer
+  // to the startup load.
+  return null;
+
+  // (original implementation, kept for reference)
   try {
     if (!existsSync(IDENTITY_FILE)) return null;
     return readFileSync(IDENTITY_FILE, 'utf-8').trim();
   } catch {
     return null;
   }
 }
```

⚠️ Caveat before applying: verify the CapabilityRecommender injection isn't doing something
loadAtStartup's plain file-load does NOT — e.g. wrapping the identity in a stronger system
reminder or persona framing that the model weights differently. If the two injection paths are
semantically equivalent, de-dup is safe. If CapabilityRecommender's framing is load-bearing
(higher salience for identity-triggering prompts), prefer instead to make `loadAtStartup`
drop DAIDENTITY and let CapabilityRecommender own it conditionally — which would also save
~2,436 tok on every NON-identity prompt. That inverted option is the bigger de-bloat win but
changes behavior (no identity in context on pure-code turns); flagging for Dennis's call.
