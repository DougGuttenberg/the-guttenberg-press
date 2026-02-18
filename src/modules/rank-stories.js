import { createLogger } from '../lib/logger.js';
import { loadWeights } from '../lib/storage.js';

const logger = createLogger('rank-stories');

const DEFAULT_WEIGHTS = {
  system_shift: 0.25,
  signal_timing: 0.20,
  cross_domain: 0.20,
  actionability: 0.20,
  evidence_quality: 0.10,
  disagreement: 0.05
};

const DEFAULT_CONFIG = {
  threshold_front_page: 7.0,
  threshold_business: 5.5,
  threshold_sports: 5.0,
  threshold_culture: 5.0,
  threshold_personal: 6.0,
  manual_boost: 2,
  front_page_max: 5,
  business_max: 4,
  sports_max: 3,
  culture_max: 3,
  personal_max: 3,
  min_total_stories: 8,
  surprise_quota_threshold: 5.0
};

function calculateFinalScore(cluster, weights) {
  const score =
    (cluster.dimension_scores.system_shift || 0) * weights.system_shift +
    (cluster.dimension_scores.signal_timing || 0) * weights.signal_timing +
    (cluster.dimension_scores.cross_domain || 0) * weights.cross_domain +
    (cluster.dimension_scores.actionability || 0) * weights.actionability +
    (cluster.dimension_scores.evidence_quality || 0) * weights.evidence_quality +
    (cluster.dimension_scores.disagreement || 0) * weights.disagreement;

  return score;
}

function assignConfidenceLabel(cluster, manualBoost) {
  const evidence = cluster.dimension_scores.evidence_quality || 0;
  const timing = cluster.dimension_scores.signal_timing || 0;
  const disagreement = cluster.dimension_scores.disagreement || 0;

  if (manualBoost && cluster.assertions && cluster.assertions.length > 0) {
    const sourceCount = cluster.assertions.filter(a => a.source).length;
    if (sourceCount > 1) {
      return 'Your Signal → Confirmed';
    }
    return 'Your Signal';
  }

  if (disagreement >= 8) {
    return 'Contested';
  }

  if (evidence >= 8 && timing <= 6) {
    return 'Confirmed Pattern';
  }

  if (evidence <= 7 && timing >= 8) {
    return 'Early Signal';
  }

  return 'Developing';
}

function selectStoriesBySection(sortedClusters, config) {
  const selections = {
    front_page: [],
    business: [],
    sports: [],
    culture: [],
    personal: []
  };

  let rank = 1;
  const usedClusterIds = new Set();

  // Front page - top stories across all domains
  for (const cluster of sortedClusters) {
    if (selections.front_page.length >= config.front_page_max) break;
    if (cluster.final_score >= config.threshold_front_page) {
      selections.front_page.push({ ...cluster, rank: rank++ });
      usedClusterIds.add(cluster.cluster_id);
    }
  }

  // Business & AI
  for (const cluster of sortedClusters) {
    if (selections.business.length >= config.business_max) break;
    if (usedClusterIds.has(cluster.cluster_id)) continue;
    const domains = cluster.domains || [];
    if ((domains.includes('ai') || domains.includes('business')) && cluster.final_score >= config.threshold_business) {
      selections.business.push({ ...cluster, rank: rank++ });
      usedClusterIds.add(cluster.cluster_id);
    }
  }

  // Sports
  for (const cluster of sortedClusters) {
    if (selections.sports.length >= config.sports_max) break;
    if (usedClusterIds.has(cluster.cluster_id)) continue;
    const domains = cluster.domains || [];
    if (domains.includes('sports') && cluster.final_score >= config.threshold_sports) {
      selections.sports.push({ ...cluster, rank: rank++ });
      usedClusterIds.add(cluster.cluster_id);
    }
  }

  // Culture
  for (const cluster of sortedClusters) {
    if (selections.culture.length >= config.culture_max) break;
    if (usedClusterIds.has(cluster.cluster_id)) continue;
    const domains = cluster.domains || [];
    if (domains.includes('culture') && cluster.final_score >= config.threshold_culture) {
      selections.culture.push({ ...cluster, rank: rank++ });
      usedClusterIds.add(cluster.cluster_id);
    }
  }

  // Personal
  for (const cluster of sortedClusters) {
    if (selections.personal.length >= config.personal_max) break;
    if (usedClusterIds.has(cluster.cluster_id)) continue;
    const domains = cluster.domains || [];
    if (domains.includes('personal') && cluster.final_score >= config.threshold_personal) {
      selections.personal.push({ ...cluster, rank: rank++ });
      usedClusterIds.add(cluster.cluster_id);
    }
  }

  return { selections, usedClusterIds, nextRank: rank };
}

function applySupriseQuota(selections, sortedClusters, usedClusterIds, config) {
  const selectedDomains = new Set();
  Object.values(selections).forEach(section => {
    section.forEach(story => {
      const domains = story.domains || [];
      domains.forEach(d => selectedDomains.add(d));
    });
  });

  if (selectedDomains.size <= 2) {
    logger.info(`Domain coverage is ${selectedDomains.size}, applying surprise quota`);

    // Find underrepresented domains
    const allDomains = new Set();
    sortedClusters.forEach(c => {
      const domains = c.domains || [];
      domains.forEach(d => allDomains.add(d));
    });

    const underrepresented = Array.from(allDomains).filter(d => !selectedDomains.has(d));

    // Find best story from underrepresented domains
    for (const cluster of sortedClusters) {
      if (usedClusterIds.has(cluster.cluster_id)) continue;
      const domains = cluster.domains || [];
      const hasUnderrepresented = domains.some(d => underrepresented.includes(d));
      if (hasUnderrepresented && cluster.final_score >= config.surprise_quota_threshold) {
        logger.info(`Selected surprise pick from domain(s): ${domains.join(', ')}`);
        return cluster;
      }
    }
  }

  return null;
}

function buildSelectedStory(cluster, rank) {
  return {
    rank,
    cluster_id: cluster.cluster_id,
    headline: cluster.headline,
    final_score: cluster.final_score,
    confidence_label: cluster.confidence_label,
    why_this_matters: cluster.why_this_matters || 'This story represents a significant development.',
    links: {
      primary: cluster.assertions && cluster.assertions[0]?.url ? cluster.assertions[0].url : null,
      analysis: cluster.assertions && cluster.assertions[1]?.url ? cluster.assertions[1].url : null,
      community: cluster.assertions && cluster.assertions[2]?.url ? cluster.assertions[2].url : null
    },
    source_count: cluster.source_count || (cluster.assertions ? cluster.assertions.length : 0),
    domains: cluster.domains || [],
    dimension_scores: cluster.dimension_scores
  };
}

export default async function rankStories(scoredData) {
  const startTime = Date.now();
  logger.info('Starting story ranking process');

  if (!scoredData || !scoredData.scored_clusters) {
    throw new Error('Invalid scored data: missing scored_clusters');
  }

  let weights = DEFAULT_WEIGHTS;
  let config = DEFAULT_CONFIG;

  try {
    const judgmentModel = loadWeights();
    if (judgmentModel && judgmentModel.weights) {
      // Extract just the dimension weights (not manual_boost)
      const { manual_boost, ...dimensionWeights } = judgmentModel.weights;
      weights = { ...DEFAULT_WEIGHTS, ...dimensionWeights };
      logger.info(`Loaded custom weights from config: ${JSON.stringify(weights)}`);
    }
    if (judgmentModel && judgmentModel.thresholds) {
      // Map threshold keys to config keys (per-section)
      config = {
        ...DEFAULT_CONFIG,
        threshold_front_page: judgmentModel.thresholds.front_page || DEFAULT_CONFIG.threshold_front_page,
        threshold_business: judgmentModel.thresholds.business_section || DEFAULT_CONFIG.threshold_business,
        threshold_sports: judgmentModel.thresholds.sports_section || DEFAULT_CONFIG.threshold_sports,
        threshold_culture: judgmentModel.thresholds.culture_section || DEFAULT_CONFIG.threshold_culture,
        threshold_personal: judgmentModel.thresholds.personal_section || DEFAULT_CONFIG.threshold_personal,
        manual_boost: judgmentModel.weights?.manual_boost || DEFAULT_CONFIG.manual_boost,
      };
      logger.info(`Loaded per-section thresholds: front=${config.threshold_front_page}, biz=${config.threshold_business}, sports=${config.threshold_sports}, culture=${config.threshold_culture}, personal=${config.threshold_personal}`);
    }
    if (judgmentModel && judgmentModel.section_limits) {
      const limits = judgmentModel.section_limits;
      config.front_page_max = limits.front_page?.max || config.front_page_max;
      config.business_max = limits.business?.max || config.business_max;
      config.sports_max = limits.sports?.max || config.sports_max;
      config.culture_max = limits.culture?.max || config.culture_max;
      config.personal_max = limits.personal?.max || config.personal_max;
    }
  } catch (error) {
    logger.warn(`Could not load judgment model, using defaults: ${error.message}`);
  }

  // Calculate final scores and confidence labels
  const clustersWithScores = scoredData.scored_clusters.map(cluster => {
    const finalScore = calculateFinalScore(cluster, weights);
    const boostedScore = cluster.manual_boost ? finalScore + config.manual_boost : finalScore;
    const confidenceLabel = assignConfidenceLabel(cluster, cluster.manual_boost);

    return {
      ...cluster,
      final_score: boostedScore,
      confidence_label: confidenceLabel
    };
  });

  // Sort by final score descending
  const sortedClusters = clustersWithScores.sort((a, b) => b.final_score - a.final_score);

  // Log top scores for debugging
  logger.info(`Sorted ${sortedClusters.length} clusters by final score`);
  sortedClusters.slice(0, 10).forEach((c, i) => {
    logger.info(`  #${i + 1}: "${c.headline}" — score=${c.final_score.toFixed(2)}, domains=[${(c.domains || []).join(',')}], confidence=${c.confidence_label}`);
  });

  // Select stories by section
  let { selections, usedClusterIds, nextRank } = selectStoriesBySection(sortedClusters, config);

  // Fallback: if not enough stories were selected, fill up from the top-scoring remaining clusters
  const totalSelected = Object.values(selections).reduce((acc, s) => acc + s.length, 0);
  if (totalSelected < config.min_total_stories && sortedClusters.length > 0) {
    logger.warn(`Only ${totalSelected} stories passed thresholds (need ${config.min_total_stories}). Filling from top remaining clusters.`);

    // If literally zero, seed front page first
    if (totalSelected === 0) {
      for (const cluster of sortedClusters.slice(0, Math.min(config.front_page_max, sortedClusters.length))) {
        if (usedClusterIds.has(cluster.cluster_id)) continue;
        selections.front_page.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
      }
    }

    // Fill remaining sections from unused clusters by domain match (no threshold)
    for (const cluster of sortedClusters) {
      if (usedClusterIds.has(cluster.cluster_id)) continue;
      const domains = cluster.domains || [];
      let placed = false;

      if ((domains.includes('ai') || domains.includes('business')) && selections.business.length < config.business_max) {
        selections.business.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
        placed = true;
      } else if (domains.includes('sports') && selections.sports.length < config.sports_max) {
        selections.sports.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
        placed = true;
      } else if (domains.includes('culture') && selections.culture.length < config.culture_max) {
        selections.culture.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
        placed = true;
      } else if (domains.includes('personal') && selections.personal.length < config.personal_max) {
        selections.personal.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
        placed = true;
      }

      // If it didn't fit a section and front page has room, put it there
      if (!placed && selections.front_page.length < config.front_page_max) {
        selections.front_page.push({ ...cluster, rank: nextRank++ });
        usedClusterIds.add(cluster.cluster_id);
      }

      // Check if we've reached the minimum
      const currentTotal = Object.values(selections).reduce((acc, s) => acc + s.length, 0);
      if (currentTotal >= config.min_total_stories) break;
    }

    const filledTotal = Object.values(selections).reduce((acc, s) => acc + s.length, 0);
    logger.info(`After fallback fill: ${filledTotal} total stories selected`);
  }

  // Apply surprise quota
  let surprisePick = null;
  if (Object.values(selections).some(section => section.length > 0)) {
    surprisePick = applySupriseQuota(selections, sortedClusters, usedClusterIds, config);
  }

  // Build final selections with proper structure
  const dailySelections = {
    front_page: selections.front_page.map((s, i) => buildSelectedStory(s, s.rank)),
    business: selections.business.map((s, i) => buildSelectedStory(s, s.rank)),
    sports: selections.sports.map((s, i) => buildSelectedStory(s, s.rank)),
    culture: selections.culture.map((s, i) => buildSelectedStory(s, s.rank)),
    personal: selections.personal.map((s, i) => buildSelectedStory(s, s.rank)),
    surprise_pick: surprisePick ? buildSelectedStory(surprisePick, nextRank) : null
  };

  const totalStories = Object.values(dailySelections).filter(s => s !== null).reduce((acc, section) => {
    return Array.isArray(section) ? acc + section.length : acc + 1;
  }, 0);

  const result = {
    daily_selections: dailySelections,
    total_stories: totalStories,
    timestamp: new Date().toISOString()
  };

  const elapsed = Date.now() - startTime;
  logger.info(`Ranking complete in ${elapsed}ms. Selected ${totalStories} stories.`);

  return result;
}
