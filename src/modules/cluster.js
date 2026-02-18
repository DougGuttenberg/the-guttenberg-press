import { askClaudeJSON } from '../lib/claude-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('cluster');

const SYSTEM_PROMPT = `You are an editorial clustering engine. Group related factual assertions into coherent story clusters. Related assertions about the same topic/event belong in one cluster. Unrelated assertions are separate clusters.`;

const DOMAIN_CATEGORIES = {
  ai_business: ['ai', 'tech', 'business', 'startup', 'llm', 'model', 'neural'],
  sports: ['sports', 'nba', 'nfl', 'mlb', 'nhl', 'soccer', 'tennis', 'athlete', 'game', 'coach'],
  culture: ['music', 'film', 'tv', 'art', 'culture', 'entertainment', 'celebrity', 'award'],
  personal: ['psychology', 'health', 'personal', 'system', 'habit', 'learning', 'decision'],
};

function categorizeDomain(assertion) {
  const text = `${assertion.assertion || ''} ${assertion.source_article || ''} ${(assertion.domains || []).join(' ')}`.toLowerCase();

  for (const [category, keywords] of Object.entries(DOMAIN_CATEGORIES)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  return 'general';
}

function buildAssertionsList(assertions) {
  return assertions
    .map((assertion, idx) => `${idx}. "${assertion.source_article || assertion.assertion}" (${assertion.source_name || 'Unknown'})\n   Assertion: ${assertion.assertion}\n   Domains: ${(assertion.domains || []).join(', ')}`)
    .join('\n');
}

async function clusterAssertionGroup(assertions, groupName) {
  logger.info(`Clustering ${assertions.length} assertions from group: ${groupName}`);

  const assertionsList = buildAssertionsList(assertions);

  const prompt = `You are clustering related factual assertions into story groups.

Here are ${assertions.length} assertions to cluster:

${assertionsList}

Group these assertions into 5-15 coherent story clusters. Each cluster should contain assertions that are directly related to the same topic, event, or story.

Return a JSON array where each cluster has:
{
  "assertion_indices": [array of assertion indices that belong together],
  "headline": "brief headline capturing the cluster topic",
  "why_this_matters": "1-2 sentence explanation of significance"
}

Return ONLY valid JSON array, no other text.`;

  const clusterResult = await askClaudeJSON(prompt, { system: SYSTEM_PROMPT });

  if (!Array.isArray(clusterResult)) {
    logger.warn(`Expected array from Claude, got: ${typeof clusterResult}`);
    return [];
  }

  return clusterResult.map(cluster => ({
    ...cluster,
    group: groupName
  }));
}

async function clusterStories(assertionsData) {
  const { assertions, count, timestamp } = assertionsData;

  if (!assertions || assertions.length === 0) {
    logger.warn('No assertions provided for clustering');
    return { clusters: [], count: 0, timestamp: new Date().toISOString() };
  }

  let clustersRaw;

  // For small datasets, cluster all at once
  if (assertions.length <= 100) {
    logger.info(`Clustering ${assertions.length} assertions in single batch`);
    clustersRaw = await clusterAssertionGroup(assertions, 'all');
  } else {
    // For large datasets, split by domain and cluster separately
    logger.info(`${assertions.length} assertions detected - splitting by domain`);

    const domainGroups = {};
    assertions.forEach((assertion, idx) => {
      const domain = categorizeDomain(assertion);
      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }
      domainGroups[domain].push({ ...assertion, __originalIdx: idx });
    });

    const clusterGroups = [];
    for (const [domain, groupAssertions] of Object.entries(domainGroups)) {
      const groupClusters = await clusterAssertionGroup(groupAssertions, domain);
      // Map indices back to original positions
      groupClusters.forEach(cluster => {
        cluster.assertion_indices = cluster.assertion_indices.map(idx => {
          const found = groupAssertions.findIndex(a => a.__originalIdx !== undefined);
          return groupAssertions[idx].__originalIdx;
        });
      });
      clusterGroups.push(...groupClusters);
    }
    clustersRaw = clusterGroups;
  }

  // Generate cluster IDs and enrich with full assertion data
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');

  const clusters = clustersRaw.map((cluster, idx) => {
    const clusterId = `${cluster.headline.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30)}_${dateStr}`;

    // Enrich with full assertion objects
    const clusterAssertions = cluster.assertion_indices
      .map(idx => assertions[idx])
      .filter(Boolean);

    const sources = [...new Set(clusterAssertions.map(a => a.source_name || 'Unknown'))];
    const domains = [...new Set(clusterAssertions.flatMap(a => a.domains || []))];

    const hasManualBoost = clusterAssertions.some(a => a.manual_send === true);

    return {
      cluster_id: clusterId,
      headline: cluster.headline,
      assertion_indices: cluster.assertion_indices,
      assertions: clusterAssertions,
      source_count: sources.length,
      sources,
      domains,
      why_this_matters: cluster.why_this_matters || '',
      manual_boost: hasManualBoost,
      doug_note: cluster.doug_note || null,
    };
  });

  logger.info(`Generated ${clusters.length} clusters from ${assertions.length} assertions`);

  return {
    clusters,
    count: clusters.length,
    timestamp: now.toISOString(),
  };
}

export default clusterStories;
