#!/usr/bin/env node

/**
 * WEEKLY SYNTHESIS — Runs Sunday 8 PM Eastern
 * Analyzes past week's feedback and sends patterns report via Telegram.
 */

import 'dotenv/config';
import { createLogger } from './lib/logger.js';
import { runWeeklySynthesis } from './modules/weekly-synthesis.js';

const log = createLogger('weekly-synthesis-runner');

try {
  log.info('Starting weekly synthesis...');
  const result = await runWeeklySynthesis();
  log.info(`Weekly synthesis complete: ${result.feedback_count} feedback items analyzed`);
  process.exit(0);
} catch (error) {
  log.error(`Weekly synthesis failed: ${error.message}`);
  log.error(error.stack);
  process.exit(1);
}
