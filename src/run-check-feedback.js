#!/usr/bin/env node

/**
 * CHECK FEEDBACK — Runs every 30 min (piggybacked on check-inbox workflow)
 * Polls Telegram for button presses and note responses.
 */

import 'dotenv/config';
import { createLogger } from './lib/logger.js';
import { pollAndProcessFeedback } from './telegram/feedback-handler.js';

const log = createLogger('check-feedback');

try {
  log.info('Checking Telegram for feedback...');
  const result = await pollAndProcessFeedback();
  log.info(`Feedback check complete: ${result.processed} items processed`);
  process.exit(0);
} catch (error) {
  log.error(`Feedback check failed: ${error.message}`);
  process.exit(1);
}
