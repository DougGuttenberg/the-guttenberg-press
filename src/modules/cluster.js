import { askClaudeJSON } from '../lib/claude-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('cluster');

const SYSTEM_PROMPT = `You are a newspaper editor grouping related facts into stories. Each cluster should read like a real news story — with a specific headline about WHAT HAPPENED, not a vague topic label. Write headlines the way the New York Post or Bloomberg would: punchy, specific, naming names.`;

const DOMAIN_CATEGORIES = {
  ai_business: ['ai', 'business'],
  sports: ['sports'],
  culture: ['culture'],
  personal: ['personal'],
};

function categorizeDomain(assertion) {
  const domains = (assertion.domains || []).map(d => d.toLowerCase());

  // Use the domain Claude assigned directly — it now picks a single primary domain
  for (const [category, categoryDomains] of Object.entries(DOMAIN_CATEGORIES)) {
    if (domains.some(d => categoryDomains.includes(d))) {
      return category;
    }
  }

  return 'general';
}

function buildAssertionsList(assertions) {
  return assertions
    .map((assertion, idx) => `${idx}. [${assertion.source_name || 'Unknown'}] "${assertion.source_article || 'Untitled'}"\n   Assertion: ${assertion.assertion}\n   Domain: ${(assertion.domains || []).join(', ')}`)
    .join('\n');
}

async function clusterAssertionGroup(assertions, groupName) {
  logger.info(`Clustering ${assertions.length} assertions from group: ${groupName}`);

  const assertionsList = buildAssertionsList(assertions);

  const prompt = `Group these ${assertions.length} assertions into 5-15 story clusters. Each cluster = one news story.

${assertionsList}

HEADLINE RULES:
- Write like a real newspaper: "Anthropic Launches Agent SDK as AI Tool Wars Heat Up"
- NOT vague topic labels like "AI Development Tools and Frameworks"
- Include the key WHO/WHAT. Use names, companies, numbers.
- If a cluster is about a broad trend with no single event, lead with the most concrete example.

SUMMARY RULES:
- Write 2-3 paragraphs (150-250 words) synthesizing what the sources collectively reveal.
- Paragraph 1: What happened — the key facts, names, numbers, dates drawn from across the sources.
- Paragraph 2: Why it matters — concrete implications for advertising, creative tech, or the reader's world. Connect dots between sources if they reveal different angles.
- Paragraph 3 (optional): What to watch — upcoming decisions, dates, or signals that would confirm or change this story.
- Use specific details from the assertions. Never be vague. If sources disagree, say so.
- Write for a senior advertising/creative-tech executive who already knows the basics. Don't explain what AI is. Get to the interesting part fast.

Return a JSON array:
[
  {
    "assertion_indices": [indices that belong together],
    "headline": "specific news headline with names and facts",
    "why_this_matters": "2-3 paragraph synthesis as described above"
  }
]

Return ONLY valid JSON array.`;

  const clusterResult = await askClaudeJSON(prompt, {
    system: SYSTEM_PROMPT,
    maxTokens: 16384,
  });

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
    try {
      clustersRaw = await clusterAssertionGroup(assertions, 'all');
    } catch (error) {
      logger.error(`Single-batch clustering failed: ${error.message}`);
      clustersRaw = [];
    }
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
      try {
        // Split large groups into sub-batches of ~60 to avoid token limits
        const MAX_GROUP_SIZE = 60;
        const subBatches = [];
        if (groupAssertions.length > MAX_GROUP_SIZE) {
          logger.info(`Group "${domain}" has ${groupAssertions.length} assertions — splitting into sub-batches of ${MAX_GROUP_SIZE}`);
          for (let i = 0; i < groupAssertions.length; i += MAX_GROUP_SIZE) {
            subBatches.push(groupAssertions.slice(i, i + MAX_GROUP_SIZE));
          }
        } else {
          subBatches.push(groupAssertions);
        }

        for (let batchIdx = 0; batchIdx < subBatches.length; batchIdx++) {
          const batch = subBatches[batchIdx];
          const batchLabel = subBatches.length > 1 ? `${domain}_part${batchIdx + 1}` : domain;
          const groupClusters = await clusterAssertionGroup(batch, batchLabel);
          // Map indices back to original positions
          groupClusters.forEach(cluster => {
            cluster.assertion_indices = cluster.assertion_indices.map(idx => {
              return batch[idx]?.__originalIdx ?? idx;
            });
          });
          clusterGroups.push(...groupClusters);
        }
      } catch (error) {
        logger.error(`Failed to cluster group "${domain}" (${groupAssertions.length} assertions): ${error.message}`);
        // Continue with remaining groups instead of crashing
        continue;
      }
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
