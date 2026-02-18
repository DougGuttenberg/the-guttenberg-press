#!/usr/bin/env node

/**
 * DELIVERY — Runs at 7:30 AM Eastern
 * Loads today's processed paper and delivers via Telegram + Email.
 */

import 'dotenv/config';
import { createLogger } from './lib/logger.js';
import { loadTodaysPaper, todayStr } from './lib/storage.js';
import deliverPaper from './modules/deliver.js';
import { sendMessage, initBot } from './lib/telegram-client.js';

const log = createLogger('delivery');

async function run() {
  const dateStr = todayStr();
  log.info(`Delivering paper for ${dateStr}...`);

  const paper = loadTodaysPaper();

  if (!paper) {
    log.error(`No paper found for ${dateStr}. Nightly pipeline may have failed.`);
    try {
      initBot();
      await sendMessage(
        `⚠️ No paper ready for today (${dateStr}).\n` +
        `The nightly pipeline may not have run.\n` +
        `Run manually: npm run manual`
      );
    } catch (_) { /* ignore */ }
    process.exit(1);
  }

  log.info(`Paper loaded: ${paper.formatted_paper.metadata.story_count} stories`);

  const result = await deliverPaper(paper);

  if (result.delivery_status.telegram.success) {
    log.success('Telegram delivery successful');
  } else {
    log.error('Telegram delivery failed');
  }

  if (result.delivery_status.email.success) {
    log.success('Email delivery successful');
  } else {
    log.error('Email delivery failed');
  }

  log.info('Delivery complete');
}

try {
  await run();
  process.exit(0);
} catch (error) {
  log.error(`Delivery failed: ${error.message}`);
  log.error(error.stack);
  process.exit(1);
}
