#!/usr/bin/env bash
# Self-contained proof that the patched ConsolidateLearnings.ts emits the
# pointer-block shape AND is cumulative + marker-safe.
#
# Covers:
#   1. shape       — full list -> ref, pointer + top-N teaser -> CLAUDE.md
#   2. idempotency — rerun with no new data leaves ref + inline intact
#   3. cumulative  — a 2nd run with NEW qualifying data UNIONs (no prior-rule loss)
#   4. migration   — first run with no ref migrates rules already in the CLAUDE.md block
#   5. malformed   — a CLAUDE.md with only one marker FAILS LOUDLY (no silent no-op)
#
# Usage: bash test-generator.sh /path/to/ConsolidateLearnings.patched.ts
set -euo pipefail
GEN="${1:-$(dirname "$0")/ConsolidateLearnings.patched.ts}"
T=$(mktemp -d)
T2=$(mktemp -d)
T3=$(mktemp -d)
trap 'rm -rf "$T" "$T2" "$T3"' EXIT

CM="$T/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/CLAUDE.md"
REF="$T/MEMORY/graduated-rules.md"
mkdir -p "$T/MEMORY/STATE" "$T/MEMORY/WISDOM/FRAMES" \
         "$(dirname "$CM")" "$T/.claude/projects/-Users-Dennis-Dyall/memory"

fail=0
note() { echo "  $*"; }
write_index() { cat > "$T/MEMORY/STATE/learning-index.json"; }
run_gen() { HOME="$T" PAI_DIR="$T" bun "$GEN" >/dev/null 2>"$T/err.log"; }

# ---------------------------------------------------------------------------
echo "[1+2] shape + idempotency"
write_index <<'JSON'
{ "version": 1, "entries": [
  {"path":"a1","rating":2,"date":"2026-01-01","category":"SYSTEM","keywords":["frustration","correction","verify"],"feedback":"A1"},
  {"path":"a2","rating":2,"date":"2026-01-02","category":"SYSTEM","keywords":["frustration","correction","verify"],"feedback":"A2"},
  {"path":"a3","rating":2,"date":"2026-01-03","category":"SYSTEM","keywords":["frustration","correction","scope"],"feedback":"A3"},
  {"path":"a4","rating":2,"date":"2026-01-04","category":"SYSTEM","keywords":["frustration","correction","tooling"],"feedback":"A4"},
  {"path":"a5","rating":2,"date":"2026-01-05","category":"SYSTEM","keywords":["frustration","correction","tests"],"feedback":"A5"},
  {"path":"a6","rating":2,"date":"2026-01-06","category":"SYSTEM","keywords":["frustration","correction","deploy"],"feedback":"A6"},
  {"path":"b1","rating":3,"date":"2026-02-01","category":"FAILURES","keywords":["incomplete","task","exec"],"feedback":"B1"},
  {"path":"b2","rating":3,"date":"2026-02-02","category":"FAILURES","keywords":["incomplete","task","checkpoint"],"feedback":"B2"},
  {"path":"b3","rating":3,"date":"2026-02-03","category":"FAILURES","keywords":["incomplete","task","output"],"feedback":"B3"}
]}
JSON
cat > "$CM" <<'MD'
# Hand-written top (must survive)
<!-- GRADUATED_RULES_START -->
### Old
- old
<!-- GRADUATED_RULES_END -->
# PAI Skill System
MD

run_gen || { echo "FAIL: generator errored on run 1"; cat "$T/err.log"; exit 1; }
grep -q "Hand-written top" "$CM" || { echo "FAIL: hand-written content clobbered"; fail=1; }
# Pointer path is PAI_DIR-aware; under this test HOME it renders as ~/MEMORY/...
grep -q "Full graduated-rules list:" "$CM" || { echo "FAIL: no pointer line"; fail=1; }
grep -q "read ~/MEMORY/graduated-rules.md" "$CM" || { echo "FAIL: pointer path not PAI_DIR-aware"; fail=1; }
grep -q "more (see reference file)" "$CM" || { echo "FAIL: no teaser truncation"; fail=1; }
[ -f "$REF" ] || { echo "FAIL: ref file not written"; fail=1; }
grep -q "AUTO-GENERATED" "$REF" || { echo "FAIL: ref missing auto-gen header"; fail=1; }
ref_bullets=$(grep -c '^- ' "$REF")
inl_bullets=$(awk '/GRADUATED_RULES_START/{f=1} f{print} /GRADUATED_RULES_END/{f=0}' "$CM" | grep '^- ' | grep -vc 'more (see reference file)')
[ "$ref_bullets" -gt "$inl_bullets" ] || { echo "FAIL: ref ($ref_bullets) not richer than inline ($inl_bullets)"; fail=1; }
note "ref=$ref_bullets bullets, inline=$inl_bullets bullets"

run_gen || { echo "FAIL: generator errored on idempotent rerun"; cat "$T/err.log"; exit 1; }
grep -q "Full graduated-rules list:" "$CM" || { echo "FAIL: pointer lost after empty rerun"; fail=1; }
[ "$(grep -c '^- ' "$REF")" -eq "$ref_bullets" ] || { echo "FAIL: empty rerun changed ref bullet count"; fail=1; }
note "empty rerun preserved ref ($ref_bullets bullets)"

# ---------------------------------------------------------------------------
echo "[3] cumulative merge — new batch must UNION, not replace"
rules_before=$(grep -c '^### ' "$REF")
write_index <<'JSON'
{ "version": 1, "entries": [
  {"path":"a1","rating":2,"date":"2026-01-01","category":"SYSTEM","keywords":["frustration","correction","verify"],"feedback":"A1","consolidated":true},
  {"path":"a2","rating":2,"date":"2026-01-02","category":"SYSTEM","keywords":["frustration","correction","verify"],"feedback":"A2","consolidated":true},
  {"path":"c1","rating":2,"date":"2026-03-01","category":"SYSTEM","keywords":["security","leak","redact"],"feedback":"C1"},
  {"path":"c2","rating":2,"date":"2026-03-02","category":"SYSTEM","keywords":["security","leak","token"],"feedback":"C2"},
  {"path":"c3","rating":2,"date":"2026-03-03","category":"SYSTEM","keywords":["security","leak","scrub"],"feedback":"C3"}
]}
JSON
run_gen || { echo "FAIL: generator errored on cumulative run"; cat "$T/err.log"; exit 1; }
rules_after=$(grep -c '^### ' "$REF")
[ "$rules_after" -gt "$rules_before" ] || { echo "FAIL: rule count did not grow ($rules_before -> $rules_after)"; fail=1; }
grep -qi "Security Leak" "$REF" || { echo "FAIL: new rule not added to ref"; fail=1; }
grep -qi "Frustration Correction" "$REF" || { echo "FAIL: PRIOR rule LOST after small new batch (the data-loss bug)"; fail=1; }
note "ref grew $rules_before -> $rules_after rules; prior rules preserved"

# ---------------------------------------------------------------------------
echo "[4] migration — no ref yet, rules already in CLAUDE.md block are recovered"
CM2="$T2/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/CLAUDE.md"
mkdir -p "$T2/MEMORY/STATE" "$T2/MEMORY/WISDOM/FRAMES" "$(dirname "$CM2")" \
         "$T2/.claude/projects/-Users-Dennis-Dyall/memory"
cat > "$CM2" <<'MD'
<!-- GRADUATED_RULES_START -->
### Pre Existing Hand Graduated Rule
<!-- 98% confidence, 200 incidents, graduated 2026-01-01 -->
- legacy bullet one
- legacy bullet two
<!-- GRADUATED_RULES_END -->
# PAI Skill System
MD
cat > "$T2/MEMORY/STATE/learning-index.json" <<'JSON'
{ "version": 1, "entries": [
  {"path":"d1","rating":2,"date":"2026-04-01","category":"SYSTEM","keywords":["delegate","orchestrate","route"],"feedback":"D1"},
  {"path":"d2","rating":2,"date":"2026-04-02","category":"SYSTEM","keywords":["delegate","orchestrate","spawn"],"feedback":"D2"},
  {"path":"d3","rating":2,"date":"2026-04-03","category":"SYSTEM","keywords":["delegate","orchestrate","prd"],"feedback":"D3"}
]}
JSON
HOME="$T2" PAI_DIR="$T2" bun "$GEN" >/dev/null 2>"$T2/err.log" || { echo "FAIL: migration run errored"; cat "$T2/err.log"; exit 1; }
grep -qi "Pre Existing Hand Graduated Rule" "$T2/MEMORY/graduated-rules.md" || { echo "FAIL: legacy CLAUDE.md rule not migrated into ref"; fail=1; }
grep -qi "Delegate Orchestrate" "$T2/MEMORY/graduated-rules.md" || { echo "FAIL: new rule missing after migration"; fail=1; }
note "legacy block rule migrated + new rule merged"

# ---------------------------------------------------------------------------
echo "[5] malformed markers — must FAIL LOUDLY, not log success"
CM3="$T3/Documents/Sunthings_AppStorage_EU_e2e/_System/PAI/CLAUDE.md"
mkdir -p "$T3/MEMORY/STATE" "$T3/MEMORY/WISDOM/FRAMES" "$(dirname "$CM3")" \
         "$T3/.claude/projects/-Users-Dennis-Dyall/memory"
cat > "$CM3" <<'MD'
# top
<!-- GRADUATED_RULES_START -->
### Stray
- x
# PAI Skill System
MD
cat > "$T3/MEMORY/STATE/learning-index.json" <<'JSON'
{ "version": 1, "entries": [
  {"path":"e1","rating":2,"date":"2026-05-01","category":"SYSTEM","keywords":["verify","mechanical","evidence"],"feedback":"E1"},
  {"path":"e2","rating":2,"date":"2026-05-02","category":"SYSTEM","keywords":["verify","mechanical","check"],"feedback":"E2"},
  {"path":"e3","rating":2,"date":"2026-05-03","category":"SYSTEM","keywords":["verify","mechanical","probe"],"feedback":"E3"}
]}
JSON
if HOME="$T3" PAI_DIR="$T3" bun "$GEN" >/dev/null 2>"$T3/err.log"; then
  echo "FAIL: malformed markers did NOT fail (silent no-op risk)"; fail=1
else
  grep -qi "Malformed GRADUATED_RULES markers" "$T3/err.log" || { echo "FAIL: wrong error on malformed markers"; cat "$T3/err.log"; fail=1; }
  note "malformed markers failed loudly as expected"
fi

# ---------------------------------------------------------------------------
if [ "$fail" -eq 0 ]; then
  echo "PASS: shape + idempotency + cumulative-merge + migration + malformed-marker all verified"
else
  echo "FAILURES above."
  exit 1
fi
