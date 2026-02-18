#!/usr/bin/env node

/**
 * NIGHTLY PIPELINE — Runs at 2:00 AM Eastern
 * Fetches sources, processes through AI pipeline, saves paper for morning delivery.
 */

import 'dotenv/config';
import { createLogger } from './lib/logger.js';
import { savePaper, savePipelineStep, todayStr } from './lib/storage.js';
import fetchSources from './modules/fetch-sources.js';
import normalize from './modules/normalize.js';
import clusterStories from './modules/cluster.js';
import scoreDimensions from './modules/score-dimensions.js';
import rankStories from './modules/rank-stories.js';
import formatPaper from './modules/format-paper.js';
import { sendMessage, initBot } from './lib/telegram-client.js';

const log = createLogger('nightly-pipeline');

async function notifyError(error) {
  try {
    initBot();
    await sendMessage(`⚠️ Daily Paper pipeline error:\n${error.message}\n\nCheck logs for details.`);
  } catch (_) {
    // If we can't even send the error, just log it
    log.error('Could not send error notification via Telegram');
  }
}

async function runNightlyPipeline() {
  const dateStr = todayStr();
  const startTime = Date.now();

  log.info('═══════════════════════════════════════');
  log.info(`Starting nightly pipeline for ${dateStr}`);
  log.info('═══════════════════════════════════════');

  // Step 1: Fetch sources
  log.step(1, 6, 'Fetching sources...');
  const articles = await fetchSources();
  savePipelineStep(dateStr, '1-articles', articles);
  log.success(`Fetched ${articles.count} articles, ${articles.scores?.length || 0} scores`);

  if (articles.count === 0) {
    log.warn('No articles fetched. Check source configuration and internet connection.');
    await notifyError(new Error('No articles fetched — check sources'));
    return;
  }

  // Step 2: Normalize to assertions
  log.step(2, 6, 'Normalizing to assertions...');
  const assertions = await normalize(articles);
  savePipelineStep(dateStr, '2-assertions', assertions);
  log.success(`Extracted ${assertions.count} assertions`);

  // Step 3: Cluster stories
  log.step(3, 6, 'Clustering stories...');
  const clusters = await clusterStories(assertions);
  savePipelineStep(dateStr, '3-clusters', clusters);
  log.success(`Created ${clusters.count} clusters`);

  // Step 4: Score dimensions
  log.step(4, 6, 'Scoring dimensions (6 lenses per cluster)...');
  const scored = await scoreDimensions(clusters);
  savePipelineStep(dateStr, '4-scored', scored);
  log.success(`Scored ${scored.scored_clusters.length} clusters`);

  // Step 5: Rank stories
  log.step(5, 6, 'Ranking stories and selecting for paper...');
  const ranked = await rankStories(scored);
  savePipelineStep(dateStr, '5-ranked', ranked);
  log.success(`Selected ${ranked.total_stories} stories for today's paper`);

  // Step 6: Format paper
  log.step(6, 6, 'Formatting paper...');
  const formatted = await formatPaper(ranked, articles.scores);
  savePipelineStep(dateStr, '6-formatted', formatted);
  log.success(`Paper formatted (${formatted.formatted_paper.metadata.story_count} stories, ${formatted.formatted_paper.metadata.total_length_chars} chars)`);

  // Save the final paper for delivery
  savePaper(dateStr, {
    ...formatted,
    pipeline_metadata: {
      articles_fetched: articles.count,
      assertions_extracted: assertions.count,
      clusters_created: clusters.count,
      clusters_scored: scored.scored_clusters.length,
      stories_selected: ranked.total_stories,
      has_surprise_pick: formatted.formatted_paper.metadata.has_surprise_pick,
      processing_time_ms: Date.now() - startTime,
      date: dateStr
    }
  });

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  log.info('═══════════════════════════════════════');
  log.success(`Pipeline complete in ${elapsed} minutes`);
  log.info(`Paper ready for 7:30 AM delivery`);
  log.info('═══════════════════════════════════════');
}

// Run
try {
  await runNightlyPipeline();
  process.exit(0);
} catch (error) {
  log.error(`Pipeline failed: ${error.message}`);
  log.error(error.stack);
  await notifyError(error);
  process.exit(1);
}
