#!/usr/bin/env node

/**
 * INBOX MONITOR — Runs continuously, checks every 30 minutes
 * Watches the paper inbox for "Send to Paper" items from Doug.
 * Also listens for Telegram feedback on delivered papers.
 */

import 'dotenv/config';
import cron from 'node-cron';
import { createLogger } from './lib/logger.js';
import { checkInbox, extractPaperContent } from './lib/email-client.js';
import { addToQueue, tomorrowStr, todayStr } from './lib/storage.js';
import { initBot, sendMessage } from './lib/telegram-client.js';
import { startFeedbackListener } from './modules/capture-feedback.js';

const log = createLogger('inbox-monitor');

async function checkPaperInbox() {
  log.info('Checking paper inbox...');

  try {
    const emails = await checkInbox();

    if (emails.length === 0) {
      log.debug('No new emails in paper inbox');
      return;
    }

    log.info(`Found ${emails.length} new email(s) in paper inbox`);

    for (const email of emails) {
      const content = extractPaperContent(email);
      const targetDate = tomorrowStr();

      addToQueue(targetDate, content);
      log.info(`Queued for ${targetDate}: "${content.title}"`);

      // Acknowledge to Doug via Telegram
      try {
        const ack = content.doug_note
          ? `📧 Received: "${content.title}"\n💬 Your note: "${content.doug_note.substring(0, 100)}"\n✓ Added to tomorrow's paper consideration`
          : `📧 Received: "${content.title}"\n✓ Added to tomorrow's paper consideration`;
        await sendMessage(ack);
      } catch (telegramErr) {
        log.warn(`Could not send Telegram acknowledgment: ${telegramErr.message}`);
      }
    }
  } catch (error) {
    log.error(`Inbox check failed: ${error.message}`);
  }
}

async function run() {
  log.info('═══════════════════════════════════════');
  log.info('Inbox Monitor starting...');
  log.info('═══════════════════════════════════════');

  // Initialize Telegram bot
  try {
    initBot({ polling: true });
    log.info('Telegram bot initialized with polling');
  } catch (error) {
    log.warn(`Telegram init failed: ${error.message}. Feedback listener disabled.`);
  }

  // Start feedback listener (handles reactions + "tell me more")
  try {
    startFeedbackListener();
    log.info('Feedback listener active');
  } catch (error) {
    log.warn(`Feedback listener failed to start: ${error.message}`);
  }

  // Run inbox check immediately on start
  await checkPaperInbox();

  // Schedule inbox check every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    await checkPaperInbox();
  }, {
    timezone: process.env.TZ || 'America/New_York'
  });

  log.info('Inbox monitor running. Checking every 30 minutes.');
  log.info('Telegram feedback listener active.');
  log.info('Press Ctrl+C to stop.');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.info('Shutting down inbox monitor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Shutting down inbox monitor...');
  process.exit(0);
});

try {
  await run();
} catch (error) {
  log.error(`Inbox monitor failed: ${error.message}`);
  log.error(error.stack);
  process.exit(1);
}
