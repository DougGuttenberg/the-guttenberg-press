import TelegramBot from 'node-telegram-bot-api';
import { createLogger } from './logger.js';

const log = createLogger('telegram');

let bot = null;
let chatId = null;

/**
 * Initialize the Telegram bot (polling mode for interactive features).
 * @param {object} options
 * @param {boolean} options.polling - Enable polling for receiving messages (default: false)
 * @returns {TelegramBot}
 */
export function initBot(options = {}) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }
  if (!process.env.TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_CHAT_ID is not set');
  }

  chatId = process.env.TELEGRAM_CHAT_ID;

  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: options.polling || false
    });
    log.info('Telegram bot initialized', { polling: options.polling || false });
  }
  return bot;
}

/**
 * Get the bot instance (must call initBot first).
 */
export function getBot() {
  if (!bot) {
    return initBot();
  }
  return bot;
}

/**
 * Send a text message to Doug.
 * Telegram has a 4096 char limit, so long messages are split.
 * @param {string} text - Message text
 * @param {object} options - Telegram send options
 * @returns {Promise<object>} Sent message info
 */
export async function sendMessage(text, options = {}) {
  const b = getBot();
  const target = chatId;

  const defaultOpts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };

  // Split long messages (Telegram limit is 4096 chars)
  if (text.length <= 4096) {
    const result = await b.sendMessage(target, text, defaultOpts);
    log.info('Message sent', { messageId: result.message_id, length: text.length });
    return result;
  }

  // Split on double newlines to avoid breaking mid-sentence
  const chunks = splitMessage(text, 4000);
  const results = [];

  for (const chunk of chunks) {
    const result = await b.sendMessage(target, chunk, defaultOpts);
    results.push(result);
    // Small delay between chunks
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  log.info(`Long message sent in ${chunks.length} parts`, {
    totalLength: text.length
  });
  return results;
}

/**
 * Send a message as a reply to a specific message.
 */
export async function sendReply(text, replyToMessageId, options = {}) {
  return sendMessage(text, {
    ...options,
    reply_to_message_id: replyToMessageId
  });
}

/**
 * Register a handler for incoming messages.
 * Bot must be initialized with polling: true.
 * @param {function} handler - (msg) => void
 */
export function onMessage(handler) {
  const b = getBot();
  b.on('message', handler);
}

/**
 * Register a handler for message reactions (callback queries from inline keyboards).
 * @param {function} handler - (callbackQuery) => void
 */
export function onCallbackQuery(handler) {
  const b = getBot();
  b.on('callback_query', handler);
}

/**
 * Split a long message into chunks at natural break points.
 */
function splitMessage(text, maxLen) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    // Try to split at a double newline
    let splitIdx = remaining.lastIndexOf('\n\n', maxLen);
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      // Fall back to single newline
      splitIdx = remaining.lastIndexOf('\n', maxLen);
    }
    if (splitIdx === -1 || splitIdx < maxLen * 0.5) {
      // Fall back to space
      splitIdx = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitIdx === -1) {
      splitIdx = maxLen;
    }

    chunks.push(remaining.substring(0, splitIdx));
    remaining = remaining.substring(splitIdx).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Stop the bot (clean shutdown).
 */
export function stopBot() {
  if (bot) {
    bot.stopPolling();
    bot = null;
    log.info('Telegram bot stopped');
  }
}

export default {
  initBot, getBot, sendMessage, sendReply,
  onMessage, onCallbackQuery, stopBot
};
