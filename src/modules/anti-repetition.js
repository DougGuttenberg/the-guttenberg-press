import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../lib/logger.js';
import { askClaudeJSON } from '../lib/claude-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const ENTITY_DIR = join(DATA_DIR, 'entities');
const CONFIG_FILE = join(PROJECT_ROOT, 'config', 'dedup.json');

// Ensure entity directory exists
if (!existsSync(ENTITY_DIR)) {
  mkdirSync(ENTITY_DIR, { recursive: true });
}

const logger = createLogger('anti-repetition');

// ─── Config ───

const DEFAULTS = {
  rolling_window_days: 7,
  entity_overlap_threshold: 0.6,   // suppress at ≥60% entity overlap with no new facts
  max_entities_per_cluster: 8,
  log_level: 'info'
};

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
    }
  } catch (err) {
    logger.warn(`Could not load dedup config: ${err.message}`);
  }
  return { ...DEFAULTS };
}

// ─── Entity Storage ───

/**
 * Load entity fingerprints from the previous N days.
 * Each file: data/entities/YYYY-MM-DD.json
 * Shape: [{ headline, entities: string[], key_facts: string[] }, ...]
 */
function loadRecentEntities(windowDays) {
  const today = new Date();
  const recent = [];

  for (let i = 1; i <= windowDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const filePath = join(ENTITY_DIR, `${dateStr}.json`);

    try {
      if (existsSync(filePath)) {
        const dayEntities = JSON.parse(readFileSync(filePath, 'utf-8'));
        recent.push(...dayEntities.map(e => ({ ...e, paper_date: dateStr })));
      }
    } catch (err) {
      logger.warn(`Could not load entities for ${dateStr}: ${err.message}`);
    }
  }

  return recent;
}

/**
 * Save today's entity fingerprints for future comparisons.
 */
function saveEntities(entries, dateStr) {
  const filePath = join(ENTITY_DIR, `${dateStr}.json`);
  writeFileSync(filePath, JSON.stringify(entries, null, 2));
  logger.info(`Saved ${entries.length} entity fingerprints to ${filePath}`);
}

// ─── Entity Extraction ───

/**
 * Use DeepSeek to extract entity fingerprints from clusters.
 * Returns [{ cluster_index, entities: string[], key_facts: string[] }, ...]
 */
async function extractEntities(clusters, config) {
  const prompt = `You are an entity extraction system for a daily news digest.

For each story cluster below, extract:
1. "entities" — 3 to ${config.max_entities_per_cluster} proper nouns that identify this story (people, companies, products, organizations, specific events). Use canonical lowercase names (e.g. "openai" not "the company", "google deepmind" not "alphabet's ai lab").
2. "key_facts" — 2 to 4 specific factual claims that make THIS telling of the story unique. Include numbers, dates, product names, actions taken. Be specific enough that someone could tell whether two articles are about the same event.

CLUSTERS:
${clusters.map((c, i) => {
  const assertions = (c.assertions || []).map(a => a.assertion || a).join(' | ');
  return `[${i}] headline="${c.headline}"\nassertions: ${assertions}`;
}).join('\n\n')}

Respond with a JSON array. Each element:
{"cluster_index": <number>, "entities": ["entity1", ...], "key_facts": ["fact1", ...]}

JSON array only, no other text.`;

  try {
    const result = await askClaudeJSON(prompt, {
      provider: 'deepseek',
      temperature: 0.1,
      maxTokens: 4096
    });

    // Handle both array and { results: [...] } shapes
    const parsed = Array.isArray(result) ? result : (result.results || [result]);

    return parsed.map(item => ({
      cluster_index: item.cluster_index,
      entities: (item.entities || []).map(e => String(e).toLowerCase().trim()),
      key_facts: item.key_facts || []
    }));
  } catch (err) {
    logger.error(`Entity extraction failed: ${err.message}`);
    // Fail open — return empty entities so nothing gets incorrectly filtered
    return clusters.map((_, i) => ({
      cluster_index: i,
      entities: [],
      key_facts: []
    }));
  }
}

// ─── Comparison Logic ───

/**
 * Calculate what proportion of newEntities appear in historicalEntities.
 * Returns 0-1 (1 = all of new cluster's entities were seen before).
 */
function entityOverlap(newEntities, historicalEntities) {
  if (newEntities.length === 0) return 0;
  const histSet = new Set(historicalEntities);
  const matches = newEntities.filter(e => histSet.has(e));
  return matches.length / newEntities.length;
}

/**
 * Check whether the new cluster has genuinely new facts vs the historical match.
 * Compares key_facts using keyword overlap — if any new fact has <50% keyword
 * overlap with all historical facts combined, it's considered novel.
 */
function hasNewFacts(newFacts, historicalFacts) {
  if (newFacts.length === 0) return false;

  const histText = historicalFacts.join(' ').toLowerCase();

  const novelFacts = newFacts.filter(fact => {
    const keywords = fact.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)  // skip short/common words
      .slice(0, 6);               // check first 6 meaningful words

    if (keywords.length === 0) return false;

    const matchCount = keywords.filter(kw => histText.includes(kw)).length;
    return matchCount < keywords.length * 0.5;
  });

  return novelFacts.length > 0;
}

// ─── Public API (same interface as before) ───

/**
 * Filter scored clusters against recent entity memory.
 * Returns { filtered, skipped } — same shape as the old Jaccard version
 * so rank-stories.js needs zero changes.
 *
 * Three verdicts:
 *   "new"     → entity overlap below threshold → pass through
 *   "evolved" → high overlap but new facts      → pass through, tagged
 *   "repeat"  → high overlap, no new facts      → suppress
 */
export async function filterRepetition(scoredClusters) {
  const config = loadConfig();
  const recentEntities = loadRecentEntities(config.rolling_window_days);

  if (recentEntities.length === 0) {
    logger.info('No entity memory found — skipping anti-repetition filter');
    return { filtered: scoredClusters, skipped: [] };
  }

  logger.info(`Checking ${scoredClusters.length} clusters against ${recentEntities.length} entity records (${config.rolling_window_days}-day window)`);

  // Extract entities for today's clusters
  const todayEntities = await extractEntities(scoredClusters, config);
  logger.info(`Extracted entities for ${todayEntities.length} clusters via DeepSeek`);

  // Stash entity data on each cluster for later saving
  for (const item of todayEntities) {
    if (scoredClusters[item.cluster_index]) {
      scoredClusters[item.cluster_index]._entities = item.entities;
      scoredClusters[item.cluster_index]._key_facts = item.key_facts;
    }
  }

  const filtered = [];
  const skipped = [];

  for (let i = 0; i < scoredClusters.length; i++) {
    const cluster = scoredClusters[i];
    const entities = cluster._entities || [];
    const keyFacts = cluster._key_facts || [];

    // Find best historical match by entity overlap
    let bestOverlap = 0;
    let bestMatch = null;

    for (const hist of recentEntities) {
      const overlap = entityOverlap(entities, hist.entities);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = hist;
      }
    }

    if (bestOverlap >= config.entity_overlap_threshold) {
      // High overlap — check if there are genuinely new facts
      if (hasNewFacts(keyFacts, bestMatch?.key_facts || [])) {
        // EVOLVED: same story but with new info → pass through with tag
        cluster.is_evolution = true;
        cluster.evolved_from = {
          headline: bestMatch.headline,
          date: bestMatch.paper_date
        };
        logger.info(`EVOLVED: "${cluster.headline}" (${(bestOverlap * 100).toFixed(0)}% overlap with "${bestMatch.headline}" from ${bestMatch.paper_date}, but has new facts)`);
        filtered.push(cluster);
      } else {
        // REPEAT: same story, no new info → suppress
        logger.info(`REPEAT: "${cluster.headline}" (${(bestOverlap * 100).toFixed(0)}% overlap with "${bestMatch.headline}" from ${bestMatch.paper_date})`);
        skipped.push({
          headline: cluster.headline,
          similarity: bestOverlap,
          similar_to: bestMatch.headline,
          matched_date: bestMatch.paper_date,
          verdict: 'repeat'
        });
      }
    } else {
      // NEW: low entity overlap → pass through
      if (bestMatch) {
        logger.debug(`NEW: "${cluster.headline}" (best overlap: ${(bestOverlap * 100).toFixed(0)}% with "${bestMatch.headline}")`);
      }
      filtered.push(cluster);
    }
  }

  logger.info(`Entity dedup results: ${filtered.length} kept (${filtered.filter(c => c.is_evolution).length} evolved), ${skipped.length} suppressed`);
  return { filtered, skipped };
}

/**
 * Record today's selected clusters as entity fingerprints for future filtering.
 * Call this AFTER ranking/selection with the final chosen stories.
 *
 * Same signature as before so rank-stories.js needs no changes.
 */
export function recordToMemory(selectedStories, dateStr) {
  const today = dateStr || new Date().toISOString().split('T')[0];
  const entries = [];

  for (const section of Object.values(selectedStories)) {
    const stories = Array.isArray(section) ? section : (section ? [section] : []);
    for (const story of stories) {
      entries.push({
        headline: story.headline,
        cluster_id: story.cluster_id,
        entities: story._entities || [],
        key_facts: story._key_facts || [],
        domains: story.domains || []
      });
    }
  }

  saveEntities(entries, today);
  logger.info(`Recorded ${entries.length} entity fingerprints for ${today}`);
}

/**
 * Backfill entity fingerprints from existing daily papers.
 * Run once: node -e "import('./src/modules/anti-repetition.js').then(m => m.backfill())"
 */
export async function backfill() {
  const config = loadConfig();
  const papersDir = join(DATA_DIR, 'papers');

  if (!existsSync(papersDir)) {
    console.log('No papers directory found.');
    return;
  }

  const files = readdirSync(papersDir).filter(f => f.endsWith('.json')).sort();
  console.log(`Backfilling entities from ${files.length} papers...`);

  for (const file of files) {
    const dateStr = file.replace('.json', '');
    const entityPath = join(ENTITY_DIR, `${dateStr}.json`);

    if (existsSync(entityPath)) {
      console.log(`Skipping ${dateStr} (already backfilled)`);
      continue;
    }

    try {
      const paper = JSON.parse(readFileSync(join(papersDir, file), 'utf-8'));

      // Try multiple paths to find clusters in the paper data
      const clusters = paper.daily_selections
        ? Object.values(paper.daily_selections).flat().filter(Boolean)
        : (paper.scored?.clusters || paper.clustered?.clusters || []);

      if (clusters.length === 0) {
        console.log(`Skipping ${dateStr} (no clusters found in paper)`);
        continue;
      }

      const entityResults = await extractEntities(clusters, config);
      const entries = entityResults.map((item, idx) => ({
        headline: clusters[item.cluster_index]?.headline || clusters[idx]?.headline || 'Unknown',
        cluster_id: clusters[item.cluster_index]?.cluster_id || clusters[idx]?.cluster_id,
        entities: item.entities,
        key_facts: item.key_facts,
      }));

      saveEntities(entries, dateStr);
      console.log(`Backfilled ${dateStr}: ${entries.length} clusters`);

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`Error backfilling ${dateStr}: ${err.message}`);
    }
  }

  console.log('Backfill complete.');
}

export default { filterRepetition, recordToMemory, backfill };
