import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const RECENT_FILE = join(DATA_DIR, 'recent-clusters.json');

const logger = createLogger('anti-repetition');

const SIMILARITY_THRESHOLD = 0.55; // Jaccard similarity threshold for filtering
const MEMORY_DAYS = 7;

/**
 * Load recent clusters from memory file.
 * Returns array of { date, headline, assertions_text, domains }
 */
function loadRecentClusters() {
  if (!existsSync(RECENT_FILE)) return [];
  try {
    return JSON.parse(readFileSync(RECENT_FILE, 'utf-8'));
  } catch (error) {
    logger.warn(`Could not load recent clusters: ${error.message}`);
    return [];
  }
}

/**
 * Save recent clusters to memory file, pruning entries older than MEMORY_DAYS.
 */
function saveRecentClusters(clusters) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MEMORY_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Keep only recent entries
  const pruned = clusters.filter(c => c.date >= cutoffStr);
  writeFileSync(RECENT_FILE, JSON.stringify(pruned, null, 2));
  logger.info(`Saved ${pruned.length} recent clusters (pruned entries before ${cutoffStr})`);
}

/**
 * Extract keywords from text for similarity comparison.
 * Lowercases, removes common stop words, returns Set of words.
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'that', 'this', 'these',
    'those', 'it', 'its', 'as', 'if', 'not', 'no', 'so', 'up', 'out',
    'about', 'into', 'over', 'after', 'before', 'between', 'through',
    'more', 'most', 'new', 'also', 'than', 'very', 'just', 'how', 'all',
    'each', 'every', 'both', 'few', 'some', 'any', 'other', 'such',
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
  );
}

/**
 * Calculate Jaccard similarity between two sets of keywords.
 * Returns 0-1 (1 = identical).
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Build a text fingerprint from a cluster for comparison.
 */
function buildFingerprint(cluster) {
  const parts = [cluster.headline || ''];
  if (cluster.assertions && Array.isArray(cluster.assertions)) {
    cluster.assertions.forEach(a => {
      if (a.assertion) parts.push(a.assertion);
    });
  }
  if (cluster.why_this_matters) {
    parts.push(cluster.why_this_matters);
  }
  return parts.join(' ');
}

/**
 * Filter scored clusters against recent memory.
 * Returns { filtered, skipped } where filtered are clusters to keep.
 */
export function filterRepetition(scoredClusters) {
  const recentClusters = loadRecentClusters();

  if (recentClusters.length === 0) {
    logger.info('No recent memory — skipping anti-repetition filter');
    return { filtered: scoredClusters, skipped: [] };
  }

  logger.info(`Checking ${scoredClusters.length} clusters against ${recentClusters.length} recent entries`);

  // Pre-compute keyword sets for recent clusters
  const recentKeywordSets = recentClusters.map(rc => ({
    ...rc,
    keywords: extractKeywords(rc.fingerprint || rc.headline || ''),
  }));

  const filtered = [];
  const skipped = [];

  for (const cluster of scoredClusters) {
    const fingerprint = buildFingerprint(cluster);
    const clusterKeywords = extractKeywords(fingerprint);

    let maxSimilarity = 0;
    let mostSimilarHeadline = '';

    for (const recent of recentKeywordSets) {
      const similarity = jaccardSimilarity(clusterKeywords, recent.keywords);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarHeadline = recent.headline;
      }
    }

    if (maxSimilarity >= SIMILARITY_THRESHOLD) {
      logger.info(`SKIP: "${cluster.headline}" (similarity=${maxSimilarity.toFixed(2)} with "${mostSimilarHeadline}")`);
      skipped.push({
        headline: cluster.headline,
        similarity: maxSimilarity,
        similar_to: mostSimilarHeadline,
      });
    } else {
      filtered.push(cluster);
    }
  }

  logger.info(`Anti-repetition: kept ${filtered.length}, skipped ${skipped.length}`);
  return { filtered, skipped };
}

/**
 * Record today's selected clusters into memory for future filtering.
 * Call this AFTER ranking/selection with the final chosen stories.
 */
export function recordToMemory(selectedStories, dateStr) {
  const recentClusters = loadRecentClusters();
  const today = dateStr || new Date().toISOString().split('T')[0];

  // Build memory entries from selected stories
  const newEntries = [];
  for (const section of Object.values(selectedStories)) {
    const stories = Array.isArray(section) ? section : (section ? [section] : []);
    for (const story of stories) {
      newEntries.push({
        date: today,
        headline: story.headline,
        cluster_id: story.cluster_id,
        fingerprint: [
          story.headline,
          story.why_this_matters || '',
        ].join(' '),
        domains: story.domains || [],
      });
    }
  }

  const updated = [...recentClusters, ...newEntries];
  saveRecentClusters(updated);
  logger.info(`Recorded ${newEntries.length} stories to memory for ${today}`);
}

export default { filterRepetition, recordToMemory };
