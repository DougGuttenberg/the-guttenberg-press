import { askClaudeJSON } from '../lib/claude-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('score-dimensions');

const LENS_DEFINITIONS = {
  system_shift: {
    name: 'System Shift',
    systemPrompt: 'You are evaluating whether a story represents a system-level shift.',
    prompt: (cluster) => `Evaluate this story cluster for system-level impact:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Sources: ${cluster.sources.join(', ')}
Domains: ${cluster.domains.join(', ')}

Score this 0-10:
- 10: Clear system-level shift that changes incentives/constraints/leverage for multiple domains
- 7: Significant change to one domain's operating system
- 4: Notable trend but within existing system
- 1: Isolated event with no system implications

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },

  signal_timing: {
    name: 'Signal Timing',
    systemPrompt: 'You are evaluating the timing and novelty of this signal in information landscape.',
    prompt: (cluster) => `Evaluate this story for signal timing:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Sources: ${cluster.sources.join(', ')}

Score this 0-10:
- 10: First/early signal of emerging trend, active debate stage
- 7: Clear early indicator before mainstream awareness
- 4: Moderate signal, some coverage but still developing
- 1: Late confirmation of widely-known fact

Is this early signal or late confirmation? First mention vs everyone knows? Active debate vs settled?

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },

  cross_domain: {
    name: 'Cross-Domain',
    systemPrompt: 'You are evaluating connections between separate domains.',
    prompt: (cluster) => `Evaluate this story for cross-domain connections:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Domains: ${cluster.domains.join(', ')}
Sources: ${cluster.sources.join(', ')}

Doug's domains: AI/business, sports/strategy, culture/music, personal/systems thinking

Score this 0-10:
- 10: Directly connects 2+ of Doug's domains with novel insight
- 7: Bridges domains with clear implications
- 4: Touches multiple domains but limited connection
- 1: Single domain, no cross-domain relevance

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },

  actionability: {
    name: 'Actionability',
    systemPrompt: 'You are evaluating practical utility and actionability.',
    prompt: (cluster) => `Evaluate this story for actionability:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Domains: ${cluster.domains.join(', ')}

Score this 0-10:
- 10: Doug can directly apply technique/framework immediately
- 7: Clear actionable insight or reframing/mental model shift
- 4: Potentially useful but requires significant interpretation
- 1: Information only (FYI), no actionable insight

Can Doug do something with this? Directly actionable technique? Reframing/mental model shift? FYI only?

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },

  evidence_quality: {
    name: 'Evidence Quality',
    systemPrompt: 'You are evaluating the quality and reliability of evidence.',
    prompt: (cluster) => `Evaluate this story for evidence quality:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Sources: ${cluster.sources.join(', ')}
Assertion count: ${cluster.assertion_indices.length}

Score this 0-10:
- 10: Primary sources with hard data, multiple independent confirmations
- 7: Credible sources with concrete evidence
- 4: Mix of credible and anecdotal evidence
- 1: Mostly speculation or single weak source

How solid is the evidence? Primary source with data? Multiple confirmations? Speculation?

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },

  disagreement: {
    name: 'Disagreement',
    systemPrompt: 'You are evaluating the presence of meaningful debate and competing perspectives.',
    prompt: (cluster) => `Evaluate this story for meaningful disagreement:

Headline: "${cluster.headline}"
Why it matters: ${cluster.why_this_matters}
Sources: ${cluster.sources.join(', ')}

Score this 0-10:
- 10: Smart people meaningfully disagree with competing frameworks
- 7: Clear debate with substantive different perspectives
- 4: Some disagreement but limited depth
- 1: Consensus, no meaningful debate

Is there meaningful debate? Smart people disagree? Competing frameworks?

Provide JSON: { "score": <0-10>, "reasoning": "<brief explanation>" }`,
  },
};

async function scoreCluster(cluster) {
  logger.info(`Scoring cluster: ${cluster.cluster_id}`);

  const lensPromises = Object.entries(LENS_DEFINITIONS).map(([lensKey, lens]) => {
    const lensPrompt = lens.prompt(cluster);
    return askClaudeJSON(lensPrompt, { system: lens.systemPrompt })
      .then(result => ({
        [lensKey]: result,
      }))
      .catch(err => {
        logger.error(`Error scoring ${lensKey} for ${cluster.cluster_id}:`, err);
        return {
          [lensKey]: { score: 0, reasoning: 'Error evaluating lens' },
        };
      });
  });

  const lensResults = await Promise.all(lensPromises);

  // Merge lens results into single objects
  const dimension_scores = {};
  const dimension_reasoning = {};

  lensResults.forEach(result => {
    Object.entries(result).forEach(([lensKey, lensScore]) => {
      dimension_scores[lensKey] = lensScore.score || 0;
      dimension_reasoning[lensKey] = lensScore.reasoning || '';
    });
  });

  return {
    ...cluster,
    dimension_scores,
    dimension_reasoning,
    overall_score: Math.round(
      Object.values(dimension_scores).reduce((a, b) => a + b, 0) /
      Object.keys(dimension_scores).length
    ),
  };
}

async function scoreDimensions(clustersData) {
  const { clusters, count, timestamp } = clustersData;

  if (!clusters || clusters.length === 0) {
    logger.warn('No clusters provided for scoring');
    return { scored_clusters: [], timestamp: new Date().toISOString() };
  }

  logger.info(`Scoring ${clusters.length} clusters with 6 lens dimensions`);

  const scored_clusters = [];

  // Process clusters sequentially with 500ms delay between them
  // Each cluster's 6 lenses run in parallel
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    try {
      const scored = await scoreCluster(cluster);
      scored_clusters.push(scored);
      logger.info(`Scored cluster ${i + 1}/${clusters.length}: ${cluster.cluster_id}`);
    } catch (err) {
      logger.error(`Failed to score cluster ${cluster.cluster_id}:`, err);
      // Add cluster with error scores
      scored_clusters.push({
        ...cluster,
        dimension_scores: {
          system_shift: 0,
          signal_timing: 0,
          cross_domain: 0,
          actionability: 0,
          evidence_quality: 0,
          disagreement: 0,
        },
        dimension_reasoning: {
          system_shift: 'Error during evaluation',
          signal_timing: 'Error during evaluation',
          cross_domain: 'Error during evaluation',
          actionability: 'Error during evaluation',
          evidence_quality: 'Error during evaluation',
          disagreement: 'Error during evaluation',
        },
        overall_score: 0,
      });
    }

    // Add delay between clusters to avoid API overload
    if (i < clusters.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  logger.info(`Completed scoring for ${scored_clusters.length} clusters`);

  return {
    scored_clusters,
    timestamp: new Date().toISOString(),
  };
}

export default scoreDimensions;
