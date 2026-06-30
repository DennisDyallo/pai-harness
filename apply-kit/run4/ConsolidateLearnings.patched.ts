#!/usr/bin/env bun
/**
 * ConsolidateLearnings.ts - Periodic synthesis of learning signals into WISDOM/FRAMES
 *
 * PURPOSE:
 * Reads the learning index, clusters entries by keyword overlap, synthesizes
 * behavioral patterns, and writes WISDOM/FRAMES files. Graduates patterns:
 * - Generic behavioral patterns → global CLAUDE.md (applies to all projects)
 * - Project-specific patterns → <project>/.claude/rules/ (project-scoped)
 *
 * INVOCATION:
 * - Manual: bun run config/hooks/handlers/ConsolidateLearnings.ts
 * - Cron every 2 hours (recommended)
 * - NOT a session hook (too slow)
 *
 * FLOW:
 * 1. Read learning-index.json
 * 2. Group entries by keyword overlap (2+ shared keywords = same cluster)
 * 3. Synthesize clusters into principles
 * 4. Write WISDOM/FRAMES/<domain>.md
 * 5. Graduate generic patterns to CLAUDE.md, project-specific to .claude/rules/
 * 6. Update MEMORY.md consolidation section
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PAI_DIR = process.env.PAI_DIR || join(process.env.HOME!, '.claude');
const CLAUDE_MD_PATH = join(
  process.env.HOME!,
  'Documents',
  'Sunthings_AppStorage_EU_e2e',
  '_System',
  'PAI',
  'CLAUDE.md',
);
const INDEX_PATH = join(PAI_DIR, 'MEMORY', 'STATE', 'learning-index.json');
const FRAMES_DIR = join(PAI_DIR, 'MEMORY', 'WISDOM', 'FRAMES');
// Full graduated-rules list lives here (on-demand reference). The CLAUDE.md
// block keeps only a pointer + the top-N highest-signal rules inline.
const GRADUATED_RULES_REF_PATH = join(PAI_DIR, 'MEMORY', 'graduated-rules.md');
// Display path used in the inline pointer. Derived from PAI_DIR so clones / alternate
// installs stay consistent; falls back to the canonical ~/.claude form for the default.
const GRADUATED_RULES_REF_DISPLAY = (() => {
  const home = process.env.HOME;
  if (home && GRADUATED_RULES_REF_PATH.startsWith(home)) {
    return GRADUATED_RULES_REF_PATH.replace(home, '~');
  }
  return GRADUATED_RULES_REF_PATH;
})();
// How many highest-signal rules to keep inline in CLAUDE.md.
const INLINE_RULE_LIMIT = 5;
// How many sample bullets to show per inline rule (the full list is in the ref file).
const INLINE_BULLET_TEASER = 3;

interface LearningIndexEntry {
  path: string;
  rating: number;
  date: string;
  category: 'ALGORITHM' | 'SYSTEM' | 'FAILURES';
  keywords: string[];
  feedback: string;
  consolidated?: boolean;
}

interface LearningIndex {
  version: number;
  entries: LearningIndexEntry[];
}

interface Cluster {
  keywords: string[];
  entries: LearningIndexEntry[];
}

function readIndex(): LearningIndex {
  if (!existsSync(INDEX_PATH)) return { version: 1, entries: [] };
  try {
    return JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeIndex(index: LearningIndex): void {
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Cluster entries by keyword overlap.
 * Two entries sharing 2+ keywords are in the same cluster.
 */
function clusterByKeywords(entries: LearningIndexEntry[]): Cluster[] {
  const unconsolidated = entries.filter((e) => !e.consolidated);
  if (unconsolidated.length === 0) return [];

  const clusters: Cluster[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < unconsolidated.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: LearningIndexEntry[] = [unconsolidated[i]];
    const clusterKeywords = new Set(unconsolidated[i].keywords);
    assigned.add(i);

    for (let j = i + 1; j < unconsolidated.length; j++) {
      if (assigned.has(j)) continue;

      const overlap = unconsolidated[j].keywords.filter((k) => clusterKeywords.has(k));
      if (overlap.length >= 2) {
        cluster.push(unconsolidated[j]);
        unconsolidated[j].keywords.forEach((k) => clusterKeywords.add(k));
        assigned.add(j);
      }
    }

    if (cluster.length >= 2) {
      clusters.push({
        keywords: [...clusterKeywords],
        entries: cluster,
      });
    }
  }

  return clusters;
}

/**
 * Synthesize a cluster into a WISDOM/FRAMES principle.
 */
function synthesizeCluster(cluster: Cluster): { title: string; body: string; confidence: number } {
  const avgRating = cluster.entries.reduce((sum, e) => sum + e.rating, 0) / cluster.entries.length;
  const incidentCount = cluster.entries.length;
  const feedbacks = cluster.entries.map((e) => e.feedback);

  // Confidence: more incidents + lower avg rating (stronger signal) = higher confidence
  const baseConfidence = Math.min(95, 70 + incidentCount * 5);
  const ratingBoost = avgRating <= 3 ? 10 : avgRating <= 4 ? 5 : 0;
  const confidence = Math.min(98, baseConfidence + ratingBoost);

  // Generate a title from top keywords
  const topKeywords = cluster.keywords
    .filter((k) => k.length >= 4)
    .slice(0, 4)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1));
  const title = topKeywords.join(' ') || 'General Pattern';

  // Combine feedbacks into a body
  const body = feedbacks.map((f) => `- ${f}`).join('\n');

  return { title, body, confidence };
}

/**
 * A graduated behavioral rule, in the durable form used by the cumulative ref file.
 * `slug` is the stable identity key (dedupe is keyed on it).
 */
interface GraduatedRule {
  heading: string;
  slug: string;
  confidence: number;
  incidents: number;
  graduated: string; // ISO date
  body: string; // bullet lines (full list)
}

/**
 * Render a single rule heading (Title Case) from a principle title.
 */
function ruleHeading(title: string): string {
  return ruleSlug(title)
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Stable identity slug for a rule (used as the dedupe key across runs).
 */
function ruleSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Parse `### Heading` + metadata comment + bullet body sections out of a markdown
 * blob into GraduatedRule records. Tolerant of missing metadata. Used to recover
 * the existing cumulative set from BOTH the ref file and (on first run) the live
 * CLAUDE.md inline block, so a partial batch can never drop previously graduated rules.
 */
function parseRules(markdown: string): GraduatedRule[] {
  const rules: GraduatedRule[] = [];
  // Split on level-3 headings, keeping the heading text.
  const parts = markdown.split(/^### /m).slice(1);
  for (const part of parts) {
    const lines = part.split('\n');
    const heading = (lines.shift() ?? '').trim();
    if (!heading) continue;

    let confidence = 0;
    let incidents = 0;
    let graduated = '';
    const bodyLines: string[] = [];

    for (const line of lines) {
      const meta = line.match(/<!--\s*(\d+)% confidence,\s*(\d+) incidents,\s*graduated\s*([0-9-]+)\s*-->/);
      if (meta) {
        confidence = Number(meta[1]);
        incidents = Number(meta[2]);
        graduated = meta[3];
        continue;
      }
      // Drop the "…and N more" teaser marker — it is not a real bullet.
      if (/more \(see reference file\)/.test(line)) continue;
      if (line.trim().startsWith('-')) bodyLines.push(line.replace(/\s+$/, ''));
    }

    if (bodyLines.length === 0) continue; // headings with no bullets aren't rules
    rules.push({
      heading,
      slug: ruleSlug(heading),
      confidence,
      incidents,
      graduated,
      body: bodyLines.join('\n'),
    });
  }
  return rules;
}

/**
 * Load the existing cumulative rule set. Reads the ref file if present; otherwise
 * (first run after this patch) migrates whatever rules already live in the live
 * CLAUDE.md GRADUATED_RULES block so nothing is lost on the transition.
 */
function loadExistingRules(claudeMd: string): GraduatedRule[] {
  if (existsSync(GRADUATED_RULES_REF_PATH)) {
    return parseRules(readFileSync(GRADUATED_RULES_REF_PATH, 'utf-8'));
  }
  const block = claudeMd.match(/<!-- GRADUATED_RULES_START -->([\s\S]*?)<!-- GRADUATED_RULES_END -->/);
  return block ? parseRules(block[1]) : [];
}

/**
 * Merge new graduated principles into the existing cumulative set.
 * Dedupe by slug; on collision keep the MAX incidents and MAX confidence and the
 * richer (longer) body, so a smaller later batch never shrinks an existing rule.
 */
function mergeRules(
  existing: GraduatedRule[],
  incoming: Array<{ title: string; body: string; confidence: number; incidents: number }>,
  date: string,
): GraduatedRule[] {
  const bySlug = new Map<string, GraduatedRule>();
  for (const r of existing) bySlug.set(r.slug, r);

  for (const p of incoming) {
    const slug = ruleSlug(p.title);
    const prev = bySlug.get(slug);
    if (!prev) {
      bySlug.set(slug, {
        heading: ruleHeading(p.title),
        slug,
        confidence: p.confidence,
        incidents: p.incidents,
        graduated: date,
        body: p.body,
      });
      continue;
    }
    bySlug.set(slug, {
      heading: prev.heading || ruleHeading(p.title),
      slug,
      confidence: Math.max(prev.confidence, p.confidence),
      incidents: Math.max(prev.incidents, p.incidents),
      graduated: prev.graduated || date,
      // Keep the richer body (more bullets wins; ties keep existing).
      body: p.body.split('\n').length > prev.body.split('\n').length ? p.body : prev.body,
    });
  }
  return [...bySlug.values()];
}

/**
 * Composite signal score for inline ranking. Incident count dominates, but a small
 * confidence term prevents a very-high-confidence rule from being demoted purely on
 * incident count. Keeps the always-on inline set meaningful without a pin list.
 */
function ruleScore(r: GraduatedRule): number {
  return r.incidents * 100 + r.confidence;
}

/**
 * Write the FULL cumulative graduated-rules list to the on-demand reference file.
 * The ref is the sole complete home, so it is always written as the union — never
 * an overwrite of a partial batch.
 */
function writeGraduatedRulesRef(rules: GraduatedRule[], date: string): void {
  const ranked = [...rules].sort((a, b) => ruleScore(b) - ruleScore(a));
  const sections = ranked.map(
    (r) => `### ${r.heading}
<!-- ${r.confidence}% confidence, ${r.incidents} incidents, graduated ${r.graduated || date} -->
${r.body}`,
  );

  const refContent = `<!-- AUTO-GENERATED by ConsolidateLearnings.ts — do not edit by hand -->
# Graduated Behavioral Rules (full list)

These are high-confidence behavioral patterns (90%+ confidence, 3+ incidents) that
graduated from the learning system. This file is the complete, CUMULATIVE record,
loaded on demand. The global CLAUDE.md keeps only a pointer here plus the top
${INLINE_RULE_LIMIT} highest-signal rules inline.

Last consolidated: ${date}

${sections.join('\n\n')}
`;

  const refDir = join(PAI_DIR, 'MEMORY');
  if (!existsSync(refDir)) mkdirSync(refDir, { recursive: true });
  writeFileSync(GRADUATED_RULES_REF_PATH, refContent, 'utf-8');
  console.log(`[Consolidation] Wrote cumulative graduated-rules ref (${rules.length} rules): ${GRADUATED_RULES_REF_PATH}`);
}

/**
 * Replace the GRADUATED_RULES block in CLAUDE.md content, marker-safely.
 * - Both markers present, well-formed → replace the block.
 * - Neither marker → insert a fresh block before the PAI Skill System section.
 * - Exactly one marker (malformed) → throw, so the caller fails loudly instead of
 *   logging success on a silent no-op or leaving a stray marker.
 */
function replaceGraduatedBlock(content: string, block: string): string {
  const hasStart = content.includes('<!-- GRADUATED_RULES_START -->');
  const hasEnd = content.includes('<!-- GRADUATED_RULES_END -->');

  if (hasStart && hasEnd) {
    const re = /<!-- GRADUATED_RULES_START -->[\s\S]*?<!-- GRADUATED_RULES_END -->/;
    if (!re.test(content)) {
      throw new Error('GRADUATED_RULES markers present but block could not be matched (END before START?).');
    }
    return content.replace(re, block);
  }
  if (!hasStart && !hasEnd) {
    const skillSectionIdx = content.indexOf('# PAI Skill System');
    if (skillSectionIdx >= 0) {
      return `${content.slice(0, skillSectionIdx) + block}\n\n${content.slice(skillSectionIdx)}`;
    }
    return `${content}\n\n${block}`;
  }
  throw new Error(
    `Malformed GRADUATED_RULES markers in CLAUDE.md (START=${hasStart}, END=${hasEnd}); refusing to write to avoid corruption.`,
  );
}

/**
 * Graduate generic behavioral patterns into the global CLAUDE.md.
 *
 * Cumulative + marker-safe:
 *   - Loads the existing rule set (ref file, or migrated from the live CLAUDE.md
 *     block on first run) and MERGES the current batch into it (dedupe by slug,
 *     union, keep max incidents/confidence + richer body).
 *   - Writes the FULL union to the on-demand reference file.
 *   - Emits into the GRADUATED_RULES_START/END block only a `read` pointer plus the
 *     top-N highest-signal rules (composite score) as heading + metadata + teaser
 *     bullets.
 *
 * A partial batch can never drop previously graduated rules; an empty batch leaves
 * the existing ref + inline block untouched.
 */
function graduateToClaudeMd(
  principles: Array<{ title: string; body: string; confidence: number; incidents: number }>,
): number {
  if (!existsSync(CLAUDE_MD_PATH)) {
    console.log('[Consolidation] CLAUDE.md not found, skipping graduation');
    return 0;
  }

  const qualifying = principles.filter((p) => p.confidence >= 90 && p.incidents >= 3);

  let content = readFileSync(CLAUDE_MD_PATH, 'utf-8');
  const existing = loadExistingRules(content);

  // Empty batch: leave the existing ref + inline block intact (never overwrite with nothing).
  if (qualifying.length === 0) {
    if (existing.length === 0) return 0;
    console.log('[Consolidation] No new qualifying rules; leaving existing graduated-rules intact');
    return 0;
  }

  const date = new Date().toISOString().split('T')[0];
  const merged = mergeRules(existing, qualifying, date);

  // 1) Full cumulative union → on-demand reference file.
  writeGraduatedRulesRef(merged, date);

  // 2) Top-N inline (chosen from the FULL cumulative set), teaser bullets only.
  const ranked = [...merged].sort((a, b) => ruleScore(b) - ruleScore(a));
  const inline = ranked.slice(0, INLINE_RULE_LIMIT).map((r) => {
    const bullets = r.body.split('\n').filter((l) => l.trim().startsWith('-'));
    const teaser = bullets.slice(0, INLINE_BULLET_TEASER).join('\n');
    const more =
      bullets.length > INLINE_BULLET_TEASER
        ? `\n- …and ${bullets.length - INLINE_BULLET_TEASER} more (see reference file)`
        : '';
    return `### ${r.heading}
<!-- ${r.confidence}% confidence, ${r.incidents} incidents, graduated ${r.graduated || date} -->
${teaser}${more}`;
  });

  const pointer = `> Full graduated-rules list: \`read ${GRADUATED_RULES_REF_DISPLAY}\` (${merged.length} rules total; top ${Math.min(INLINE_RULE_LIMIT, merged.length)} shown inline below).`;

  const graduatedBlock = `<!-- GRADUATED_RULES_START -->

${pointer}

${inline.join('\n\n')}

<!-- GRADUATED_RULES_END -->`;

  content = replaceGraduatedBlock(content, graduatedBlock);
  writeFileSync(CLAUDE_MD_PATH, content, 'utf-8');
  console.log(
    `[Consolidation] Graduated ${qualifying.length} new patterns; ${merged.length} cumulative (${Math.min(INLINE_RULE_LIMIT, merged.length)} inline + pointer) to global CLAUDE.md`,
  );
  return qualifying.length;
}

/**
 * Update MEMORY.md with consolidated patterns.
 */
function updateMemoryMd(patterns: string[]): void {
  const memoryDir = join(process.env.HOME!, '.claude', 'projects', '-Users-Dennis-Dyall', 'memory');
  const memoryPath = join(memoryDir, 'MEMORY.md');

  if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });

  let content = '';
  if (existsSync(memoryPath)) {
    content = readFileSync(memoryPath, 'utf-8');
  }

  const consolidationBlock = `<!-- CONSOLIDATION_START -- do not edit below this line manually -->

### Behavioral Patterns (auto-updated)

${patterns.join('\n\n')}

<!-- CONSOLIDATION_END -->`;

  if (content.includes('CONSOLIDATION_START')) {
    content = content.replace(/<!-- CONSOLIDATION_START[\s\S]*?<!-- CONSOLIDATION_END -->/, consolidationBlock);
  } else {
    content += `\n\n${consolidationBlock}`;
  }

  writeFileSync(memoryPath, content, 'utf-8');
  console.log('[Consolidation] Updated MEMORY.md');
}

async function main() {
  console.log('[Consolidation] Starting learning consolidation...');

  const index = readIndex();
  if (index.entries.length === 0) {
    console.log('[Consolidation] No entries in learning index');
    process.exit(0);
  }

  console.log(
    `[Consolidation] ${index.entries.length} total entries, ${index.entries.filter((e) => !e.consolidated).length} unconsolidated`,
  );

  // Cluster by keyword overlap
  const clusters = clusterByKeywords(index.entries);
  console.log(`[Consolidation] Found ${clusters.length} clusters with 2+ entries`);

  if (clusters.length === 0) {
    console.log('[Consolidation] No clusters large enough to consolidate');
    process.exit(0);
  }

  // Synthesize each cluster
  const principles: Array<{ title: string; body: string; confidence: number; incidents: number; domain: string }> = [];

  for (const cluster of clusters) {
    const { title, body, confidence } = synthesizeCluster(cluster);
    const domain = cluster.entries[0].category === 'FAILURES' ? 'failures' : 'behavioral';
    const incidents = cluster.entries.length;

    principles.push({ title, body, confidence, incidents, domain });

    console.log(`[Consolidation] Cluster "${title}": ${incidents} incidents, ${confidence}% confidence`);
  }

  // Write WISDOM/FRAMES files
  if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });

  const framesByDomain = new Map<string, typeof principles>();
  for (const p of principles) {
    const existing = framesByDomain.get(p.domain) || [];
    existing.push(p);
    framesByDomain.set(p.domain, existing);
  }

  for (const [domain, domainPrinciples] of framesByDomain) {
    const framePath = join(FRAMES_DIR, `${domain}-consolidated.md`);
    const content = `# Domain: ${domain.charAt(0).toUpperCase() + domain.slice(1)} (Auto-consolidated)

${domainPrinciples
  .map((p) => {
    const dates = [
      ...new Set(clusters.find((c) => synthesizeCluster(c).title === p.title)?.entries.map((e) => e.date) || []),
    ];
    return `### ${p.title} [CRYSTAL: ${p.confidence}%]
<!-- incidents: ${p.incidents} | sources: ${dates.join(', ')} -->
${p.body}`;
  })
  .join('\n\n')}
`;
    writeFileSync(framePath, content, 'utf-8');
    console.log(`[Consolidation] Wrote frame: ${domain}-consolidated.md`);
  }

  // Graduate generic behavioral patterns to global CLAUDE.md
  const graduated = graduateToClaudeMd(principles);
  console.log(`[Consolidation] Graduated ${graduated} to CLAUDE.md`);

  // Mark consolidated entries in index
  for (const cluster of clusters) {
    for (const entry of cluster.entries) {
      const idx = index.entries.findIndex((e) => e.path === entry.path);
      if (idx >= 0) index.entries[idx].consolidated = true;
    }
  }
  writeIndex(index);

  // Update MEMORY.md
  const patternSummaries = principles.map(
    (p) => `- **${p.title}** (${p.confidence}%, ${p.incidents} incidents): Key pattern from ${p.domain} learnings`,
  );
  updateMemoryMd(patternSummaries);

  console.log('[Consolidation] Complete!');
}

main().catch((err) => {
  console.error('[Consolidation] Fatal error:', err);
  process.exit(1);
});
