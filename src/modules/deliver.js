import { sendMessage } from '../lib/telegram-client.js';
import { sendEmail } from '../lib/email-client.js';
import { createLogger } from '../lib/logger.js';
import { saveMessageMap, todayStr } from '../lib/storage.js';

const logger = createLogger('deliver');

async function retryWithBackoff(fn, retries = 1, delayMs = 5000) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export default async function deliverPaper(formattedData) {
  const { formatted_paper, timestamp } = formattedData;
  const { text, html, metadata } = formatted_paper;

  const results = {
    delivery_status: {
      telegram: { success: false, message_id: null, sent_at: null },
      email: { success: false, message_id: null, sent_at: null }
    }
  };

  const dateStr = new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Send to Telegram
  try {
    logger.info('Sending paper to Telegram...');
    const messageId = await retryWithBackoff(() => sendMessage(text), 1, 5000);

    results.delivery_status.telegram = {
      success: true,
      message_id: messageId,
      sent_at: new Date().toISOString()
    };

    // Save message map for feedback tracking
    await saveMessageMap(todayStr(), messageId, metadata);
    logger.info(`Telegram delivery successful. Message ID: ${messageId}`);
  } catch (error) {
    logger.error(`Telegram delivery failed: ${error.message}`);
    results.delivery_status.telegram.success = false;
  }

  // Send to Email
  try {
    logger.info('Sending paper to email...');
    const emailResult = await retryWithBackoff(() =>
      sendEmail({
        to: process.env.DOUG_EMAIL,
        subject: `📰 Your Paper — ${dateStr}`,
        text: text,
        html: html
      }), 1, 5000
    );

    results.delivery_status.email = {
      success: true,
      message_id: emailResult.messageId || emailResult.id,
      sent_at: new Date().toISOString()
    };

    logger.info(`Email delivery successful. Message ID: ${results.delivery_status.email.message_id}`);
  } catch (error) {
    logger.error(`Email delivery failed: ${error.message}`);
    results.delivery_status.email.success = false;
  }

  // Log summary
  const telegramStatus = results.delivery_status.telegram.success ? 'SUCCESS' : 'FAILED';
  const emailStatus = results.delivery_status.email.success ? 'SUCCESS' : 'FAILED';
  logger.info(`Delivery complete — Telegram: ${telegramStatus}, Email: ${emailStatus}`);

  return results;
}
