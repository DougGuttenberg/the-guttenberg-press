#!/usr/bin/env node

/**
 * START ALL — Unified entry point
 * Runs the nightly pipeline on schedule, delivers at 7:30 AM,
 * and monitors the inbox continuously.
 *
 * This is an alternative to using launchd for scheduling.
 * Run with: npm start
 */

import 'dotenv/config';
import cron from 'node-cron';
import { createLogger } from './lib/logger.js';

const log = createLogger('scheduler');
const tz = process.env.TZ || 'America/New_York';

log.info('╔═══════════════════════════════════════════╗');
log.info('║   DAILY PAPER SYSTEM — Running            ║');
log.info('╚═══════════════════════════════════════════╝');
log.info(`Timezone: ${tz}`);
log.info('');
log.info('Schedule:');
log.info('  • 2:00 AM  — Nightly pipeline (fetch + process)');
log.info('  • 7:30 AM  — Deliver paper (Telegram + Email)');
log.info('  • Every 30 min — Check inbox for "Send to Paper"');
log.info('');

// Import modules dynamically to avoid loading everything at startup

// ─── Nightly Pipeline: 2:00 AM ───
cron.schedule('0 2 * * *', async () => {
  log.info('⏰ Triggering nightly pipeline...');
  try {
    const { default: fetchSources } = await import('./modules/fetch-sources.js');
    const { default: normalize } = await import('./modules/normalize.js');
    const { default: clusterStories } = await import('./modules/cluster.js');
    const { default: scoreDimensions } = await import('./modules/score-dimensions.js');
    const { default: rankStories } = await import('./modules/rank-stories.js');
    const { default: formatPaper } = await import('./modules/format-paper.js');
    const { savePaper, savePipelineStep, todayStr } = await import('./lib/storage.js');

    const dateStr = todayStr();
    const start = Date.now();

    const articles = await fetchSources();
    savePipelineStep(dateStr, '1-articles', articles);

    const assertions = await normalize(articles);
    savePipelineStep(dateStr, '2-assertions', assertions);

    const clusters = await clusterStories(assertions);
    savePipelineStep(dateStr, '3-clusters', clusters);

    const scored = await scoreDimensions(clusters);
    savePipelineStep(dateStr, '4-scored', scored);

    const ranked = await rankStories(scored);
    savePipelineStep(dateStr, '5-ranked', ranked);

    const formatted = await formatPaper(ranked, articles.scores);
    savePipelineStep(dateStr, '6-formatted', formatted);

    savePaper(dateStr, {
      ...formatted,
      pipeline_metadata: {
        articles_fetched: articles.count,
        assertions_extracted: assertions.count,
        clusters_created: clusters.count,
        stories_selected: ranked.total_stories,
        processing_time_ms: Date.now() - start,
        date: dateStr
      }
    });

    log.success(`Pipeline complete in ${((Date.now() - start) / 60000).toFixed(1)} minutes`);
  } catch (error) {
    log.error(`Nightly pipeline failed: ${error.message}`);
  }
}, { timezone: tz });

// ─── Delivery: 7:30 AM ───
cron.schedule('30 7 * * *', async () => {
  log.info('⏰ Triggering paper delivery...');
  try {
    const { loadTodaysPaper } = await import('./lib/storage.js');
    const { default: deliverPaper } = await import('./modules/deliver.js');

    const paper = loadTodaysPaper();
    if (!paper) {
      log.error('No paper ready for delivery');
      return;
    }

    await deliverPaper(paper);
    log.success('Paper delivered');
  } catch (error) {
    log.error(`Delivery failed: ${error.message}`);
  }
}, { timezone: tz });

// ─── Inbox Monitor: Every 30 minutes ───
cron.schedule('*/30 * * * *', async () => {
  try {
    const { checkInbox, extractPaperContent } = await import('./lib/email-client.js');
    const { addToQueue, tomorrowStr } = await import('./lib/storage.js');

    const emails = await checkInbox();
    if (emails.length > 0) {
      for (const email of emails) {
        const content = extractPaperContent(email);
        addToQueue(tomorrowStr(), content);
        log.info(`Queued: "${content.title}"`);
      }
    }
  } catch (error) {
    log.error(`Inbox check failed: ${error.message}`);
  }
}, { timezone: tz });

// ─── Weekly Synthesis: Sunday 6:00 PM ───
cron.schedule('0 18 * * 0', async () => {
  log.info('⏰ Triggering weekly synthesis...');
  try {
    const { generateWeeklySynthesis, updateWeightsFromFeedback } = await import('./modules/capture-feedback.js');
    const { sendMessage } = await import('./lib/telegram-client.js');

    // Update weights first
    const weightChanges = await updateWeightsFromFeedback();
    log.info('Weights updated', weightChanges);

    // Generate and send synthesis
    const synthesis = await generateWeeklySynthesis();
    if (synthesis) {
      await sendMessage(synthesis);
      log.success('Weekly synthesis sent');
    }
  } catch (error) {
    log.error(`Weekly synthesis failed: ${error.message}`);
  }
}, { timezone: tz });

// Start feedback listener
try {
  const { initBot } = await import('./lib/telegram-client.js');
  const { startFeedbackListener } = await import('./modules/capture-feedback.js');
  initBot({ polling: true });
  startFeedbackListener();
  log.info('Telegram feedback listener active');
} catch (error) {
  log.warn(`Telegram feedback listener not started: ${error.message}`);
}

log.info('All schedules registered. System running.');
log.info('Press Ctrl+C to stop.');

// Keep process alive
process.on('SIGINT', () => {
  log.info('Shutting down Daily Paper system...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Shutting down Daily Paper system...');
  process.exit(0);
});
