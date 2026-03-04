import { sendMessage, getBot, initBot } from '../lib/telegram-client.js';
import { sendEmail } from '../lib/email-client.js';
import { createLogger } from '../lib/logger.js';
import { saveMessageMap, todayStr } from '../lib/storage.js';
import { buildFeedbackMessage } from '../telegram/feedback-handler.js';

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
      email: { success: false, message_id: null, sent_at: null },
      feedback_buttons: { success: false, sent_at: null }
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

  // Send feedback buttons via Telegram (separate message after the paper)
  try {
    const feedbackMsg = buildFeedbackMessage(formattedData, todayStr());
    if (feedbackMsg) {
      logger.info('Sending feedback buttons to Telegram...');
      const bot = initBot();
      const chatId = process.env.TELEGRAM_CHAT_ID;
      await bot.sendMessage(chatId, feedbackMsg.text, {
        parse_mode: 'HTML',
        reply_markup: feedbackMsg.keyboard,
        disable_web_page_preview: true,
      });
      results.delivery_status.feedback_buttons = {
        success: true,
        sent_at: new Date().toISOString(),
      };
      logger.info('Feedback buttons sent successfully');
    }
  } catch (error) {
    logger.error(`Feedback buttons failed: ${error.message}`);
    // Non-fatal — paper was still delivered
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
  const feedbackStatus = results.delivery_status.feedback_buttons.success ? 'SUCCESS' : 'SKIPPED';
  logger.info(`Delivery complete — Telegram: ${telegramStatus}, Email: ${emailStatus}, Feedback: ${feedbackStatus}`);

  return results;
}
