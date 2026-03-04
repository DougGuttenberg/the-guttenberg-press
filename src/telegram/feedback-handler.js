import { createLogger } from '../lib/logger.js';
import { saveFeedback, loadMessageMap, todayStr } from '../lib/storage.js';
import { getBot, initBot } from '../lib/telegram-client.js';

const logger = createLogger('telegram-feedback');

// Track pending "note" requests: chatId -> { storyId, date }
const pendingNotes = new Map();

/**
 * Build inline keyboard buttons for a list of stories.
 * Each story gets a row: [👍 Hit] [👎 Miss] [💬 Note]
 */
export function buildFeedbackKeyboard(stories, dateStr) {
  const keyboard = [];

  stories.forEach((story, idx) => {
    keyboard.push([
      { text: `👍 ${idx + 1}`, callback_data: `fb:hit:${dateStr}:${idx}` },
      { text: `👎 ${idx + 1}`, callback_data: `fb:miss:${dateStr}:${idx}` },
      { text: `💬 ${idx + 1}`, callback_data: `fb:note:${dateStr}:${idx}` },
    ]);
  });

  return { inline_keyboard: keyboard };
}

/**
 * Build the Telegram feedback summary message.
 * Sends story headlines with numbered feedback buttons.
 */
export function buildFeedbackMessage(paper, dateStr) {
  const sections = paper.daily_selections || paper.formatted_paper?.daily_selections;
  if (!sections) return null;

  const allStories = [];
  const sectionOrder = ['front_page', 'business', 'sports', 'culture', 'personal'];

  for (const sectionName of sectionOrder) {
    const stories = sections[sectionName];
    if (Array.isArray(stories)) {
      allStories.push(...stories);
    }
  }
  if (sections.surprise_pick) {
    allStories.push(sections.surprise_pick);
  }

  if (allStories.length === 0) return null;

  const dateDisplay = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  let text = `📰 <b>React to train — ${dateDisplay}</b>\n`;
  text += `${allStories.length} stories delivered. Tap to rate:\n\n`;

  allStories.forEach((story, idx) => {
    const score = story.final_score ? ` (${story.final_score.toFixed(1)})` : '';
    text += `<b>${idx + 1}.</b> ${story.headline}${score}\n`;
  });

  text += `\n👍 = Hit  👎 = Miss  💬 = Add note`;

  return {
    text,
    keyboard: buildFeedbackKeyboard(allStories, dateStr),
    stories: allStories,
  };
}

/**
 * Process a callback query (button press) from Telegram.
 * Called by the poll-based checker.
 */
export async function handleCallbackQuery(query) {
  const bot = getBot();
  const data = query.data;
  const chatId = query.message?.chat?.id;

  if (!data || !data.startsWith('fb:')) return;

  const parts = data.split(':');
  if (parts.length < 4) return;

  const [, action, dateStr, storyIdxStr] = parts;
  const storyIdx = parseInt(storyIdxStr, 10);

  logger.info(`Feedback received: ${action} for story ${storyIdx} on ${dateStr}`);

  if (action === 'hit' || action === 'miss') {
    saveFeedback(dateStr, {
      date: dateStr,
      story_index: storyIdx,
      reaction: action,
      timestamp: new Date().toISOString(),
    });

    try {
      await bot.answerCallbackQuery(query.id, { text: `✓ Noted — ${action === 'hit' ? '👍' : '👎'}` });
    } catch (e) {
      logger.warn(`Could not answer callback: ${e.message}`);
    }
  } else if (action === 'note') {
    // Prompt user for a note
    pendingNotes.set(String(chatId), { storyIdx, dateStr });

    try {
      await bot.answerCallbackQuery(query.id, { text: '💬 Send your note as a reply...' });
      await bot.sendMessage(chatId, `💬 What's your note on story #${storyIdx + 1}? Just type it:`, {
        parse_mode: 'HTML',
      });
    } catch (e) {
      logger.warn(`Could not prompt for note: ${e.message}`);
    }
  }
}

/**
 * Process a text message — check if it's a pending note response.
 */
export function handleTextMessage(msg) {
  const chatId = String(msg.chat?.id);
  const pending = pendingNotes.get(chatId);

  if (!pending) return false;

  saveFeedback(pending.dateStr, {
    date: pending.dateStr,
    story_index: pending.storyIdx,
    reaction: 'note',
    note: msg.text,
    timestamp: new Date().toISOString(),
  });

  pendingNotes.delete(chatId);
  logger.info(`Note saved for story ${pending.storyIdx} on ${pending.dateStr}: "${msg.text.substring(0, 50)}..."`);
  return true;
}

/**
 * Poll for Telegram updates and process feedback.
 * Uses getUpdates API (no webhook needed).
 */
export async function pollAndProcessFeedback() {
  const bot = initBot();
  const offsetFile = '/tmp/telegram-offset.txt';
  let offset = 0;

  // Try to load last offset from data dir
  const { existsSync: exists, readFileSync: readFile, writeFileSync: writeFile } = await import('fs');
  const { join } = await import('path');
  const { dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
  const offsetPath = join(dataDir, 'telegram-offset.json');

  if (exists(offsetPath)) {
    try {
      offset = JSON.parse(readFile(offsetPath, 'utf-8')).offset || 0;
    } catch (_) {}
  }

  logger.info(`Polling Telegram updates from offset ${offset}...`);

  try {
    const updates = await bot.getUpdates({ offset, timeout: 5, limit: 100 });

    if (updates.length === 0) {
      logger.info('No new Telegram updates');
      return { processed: 0 };
    }

    logger.info(`Processing ${updates.length} Telegram updates`);
    let processed = 0;

    for (const update of updates) {
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
        processed++;
      } else if (update.message?.text) {
        const wasNote = handleTextMessage(update.message);
        if (wasNote) processed++;
      }

      // Track highest update_id
      offset = Math.max(offset, update.update_id + 1);
    }

    // Save offset for next run
    writeFile(offsetPath, JSON.stringify({ offset, updated: new Date().toISOString() }));

    logger.info(`Processed ${processed} feedback items`);
    return { processed };
  } catch (error) {
    logger.error(`Telegram poll error: ${error.message}`);
    return { processed: 0, error: error.message };
  }
}

export default {
  buildFeedbackMessage,
  buildFeedbackKeyboard,
  handleCallbackQuery,
  handleTextMessage,
  pollAndProcessFeedback,
};
