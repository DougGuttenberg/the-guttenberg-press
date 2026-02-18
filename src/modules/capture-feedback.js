import { initBot, onMessage, sendReply } from '../lib/telegram-client.js';
import { askClaude } from '../lib/claude-client.js';
import { createLogger } from '../lib/logger.js';
import {
  saveFeedback,
  loadPaper,
  loadMessageMap,
  loadFeedbackRange,
  loadWeights,
  saveWeights,
  todayStr,
  yesterdayStr
} from '../lib/storage.js';

const logger = createLogger('capture-feedback');

const FEEDBACK_REACTIONS = ['👍', '👎', '💾', '💬'];
const DOUG_USER_ID = process.env.DOUG_USER_ID || null;

export function startFeedbackListener() {
  logger.info('Initializing Telegram bot for feedback capture...');

  const bot = initBot({ polling: true });

  onMessage(bot, async (msg) => {
    try {
      // Only listen to messages from Doug
      if (DOUG_USER_ID && msg.from.id !== parseInt(DOUG_USER_ID)) {
        return;
      }

      const messageText = msg.text || msg.caption || '';
      const chatId = msg.chat.id;
      const messageId = msg.message_id;
      const timestamp = new Date(msg.date * 1000).toISOString();

      // Handle reaction emojis on replies
      const hasReaction = FEEDBACK_REACTIONS.some(emoji => messageText.includes(emoji));
      const isReply = msg.reply_to_message && msg.reply_to_message.message_id;

      if (hasReaction && isReply) {
        const repliedToMessageId = msg.reply_to_message.message_id;
        logger.info(`Feedback reaction detected on message ${repliedToMessageId}`);

        // Extract reaction emoji
        const reaction = FEEDBACK_REACTIONS.find(emoji => messageText.includes(emoji));

        try {
          // Load message map to match message ID to story
          const messageMap = await loadMessageMap(todayStr());
          const storyMetadata = messageMap[repliedToMessageId];

          if (!storyMetadata) {
            logger.warn(`No story metadata found for message ${repliedToMessageId}`);
            return;
          }

          const { story_id, story_scores, story_domains } = storyMetadata;

          // Save feedback
          await saveFeedback(todayStr(), {
            story_id,
            reaction,
            story_scores,
            story_domains,
            timestamp,
            message_id: messageId
          });

          logger.info(`Feedback saved: ${reaction} on story ${story_id}`);

          // Handle comment reactions (💬)
          if (reaction === '💬') {
            const commentText = messageText
              .replace('💬', '')
              .trim();

            if (commentText) {
              logger.info(`Processing comment feedback: ${commentText}`);

              // Extract insight using Claude
              const insight = await askClaude(
                `Doug left this feedback note on his daily paper: "${commentText}".
                What pattern or preference is he expressing?
                Respond concisely with the core insight (1-2 sentences).`
              );

              // Save as high-value training data
              await saveFeedback(todayStr(), {
                story_id,
                reaction: '💬-insight',
                insight: insight,
                comment: commentText,
                story_scores,
                story_domains,
                timestamp,
                message_id: messageId,
                is_training_data: true
              });

              // Send acknowledgment
              await sendReply(chatId, messageId, 'Got it! I\'ve noted your insight. 📝');
              logger.info('Comment insight extracted and stored');
            }
          }
        } catch (error) {
          logger.error(`Error processing reaction feedback: ${error.message}`);
        }
      }

      // Handle "tell me more" requests
      const tellMeMoreMatch = messageText.match(/tell me more about (?:#)?(\d+)|more about (?:#)?(\d+)/i);
      if (tellMeMoreMatch) {
        const storyIndex = parseInt(tellMeMoreMatch[1] || tellMeMoreMatch[2]) - 1;
        logger.info(`"Tell me more" request for story index ${storyIndex}`);

        try {
          // Load today's paper
          const paper = await loadPaper(todayStr());
          if (!paper || !paper.stories || !paper.stories[storyIndex]) {
            await sendReply(chatId, messageId, 'Story not found. Please check the story number.');
            return;
          }

          const story = paper.stories[storyIndex];
          const storyText = JSON.stringify(story, null, 2);

          // Request deep-dive analysis from Claude
          const analysis = await askClaude(
            `Doug wants a deep-dive on this story from his daily paper:\n\n${storyText}\n\n` +
            `Provide full synthesis with context, related developments, why it connects to his work in advertising/creative-tech/AI transformation, ` +
            `confidence level explained, and actionable implications. Be thorough but conversational, not rigidly categorized.`
          );

          // Send analysis as reply
          await sendReply(chatId, messageId, analysis);
          logger.info(`Deep-dive analysis sent for story index ${storyIndex}`);
        } catch (error) {
          logger.error(`Error processing "tell me more" request: ${error.message}`);
          await sendReply(chatId, messageId, 'Unable to analyze that story. Please try again.');
        }
      }
    } catch (error) {
      logger.error(`Error in message handler: ${error.message}`);
    }
  });

  logger.info('Feedback listener started successfully');
  return bot;
}

export async function updateWeightsFromFeedback() {
  logger.info('Updating weights from past 7 days of feedback...');

  try {
    // Load feedback from past 7 days
    const feedback = await loadFeedbackRange(7);
    const weights = await loadWeights();

    if (!feedback || feedback.length === 0) {
      logger.info('No feedback data available for weight updates');
      return { summary: 'No feedback data available', updated: false };
    }

    // Separate promoted and demoted stories
    const promoted = feedback.filter(f => f.reaction === '👍');
    const demoted = feedback.filter(f => f.reaction === '👎');

    const dimensionImpact = {};

    // Analyze promoted stories
    for (const entry of promoted) {
      if (entry.story_domains) {
        for (const domain of entry.story_domains) {
          dimensionImpact[domain] = (dimensionImpact[domain] || 0) + 1;
        }
      }
    }

    // Analyze demoted stories
    for (const entry of demoted) {
      if (entry.story_domains) {
        for (const domain of entry.story_domains) {
          dimensionImpact[domain] = (dimensionImpact[domain] || 0) - 1;
        }
      }
    }

    logger.info(`Dimension impact analysis: ${JSON.stringify(dimensionImpact)}`);

    // Calculate total feedback count
    const totalFeedback = promoted.length + demoted.length;
    if (totalFeedback === 0) {
      return { summary: 'No reactions recorded', updated: false };
    }

    // Update weights based on patterns
    const weightKeys = Object.keys(weights).filter(k => k !== 'manual_boost');
    let adjustmentCount = 0;
    const changes = {};

    for (const dimension of weightKeys) {
      const impact = dimensionImpact[dimension] || 0;
      if (impact !== 0) {
        const adjustment = Math.max(-0.02, Math.min(0.02, impact * 0.01));
        weights[dimension] = Math.max(0.01, weights[dimension] + adjustment);
        changes[dimension] = adjustment;
        adjustmentCount++;
        logger.info(`Adjusted ${dimension}: ${adjustment > 0 ? '+' : ''}${adjustment.toFixed(3)}`);
      }
    }

    // Normalize weights to sum to 1.0 (excluding manual_boost)
    const totalWeight = Object.entries(weights)
      .filter(([k]) => k !== 'manual_boost')
      .reduce((sum, [, v]) => sum + v, 0);

    if (totalWeight > 0) {
      for (const key of weightKeys) {
        weights[key] = weights[key] / totalWeight;
      }
    }

    // Save updated weights
    await saveWeights(weights);

    const summary = adjustmentCount > 0
      ? `Updated ${adjustmentCount} dimensions based on ${promoted.length} 👍 and ${demoted.length} 👎 reactions. Changes: ${JSON.stringify(changes)}`
      : 'No dimension adjustments needed based on feedback patterns';

    logger.info(`Weight update complete: ${summary}`);
    return { summary, updated: adjustmentCount > 0, changes };
  } catch (error) {
    logger.error(`Error updating weights: ${error.message}`);
    return { summary: `Error: ${error.message}`, updated: false };
  }
}

export async function generateWeeklySynthesis() {
  logger.info('Generating weekly synthesis...');

  try {
    // Load past 7 days of feedback and papers
    const feedback = await loadFeedbackRange(7);
    const papers = [];

    for (let i = 0; i < 7; i++) {
      const dateOffset = i;
      // Calculate date i days ago (simplified - in real implementation, use proper date handling)
      const paper = await loadPaper(todayStr()); // Note: In production, load papers from i days ago
      if (paper) {
        papers.push(paper);
      }
    }

    if (!feedback || feedback.length === 0) {
      logger.info('Insufficient data for weekly synthesis');
      return 'Not enough feedback data for weekly synthesis yet.';
    }

    // Prepare context for Claude
    const feedbackSummary = {
      total_reactions: feedback.length,
      likes: feedback.filter(f => f.reaction === '👍').length,
      dislikes: feedback.filter(f => f.reaction === '👎').length,
      insights: feedback.filter(f => f.reaction === '💬-insight').map(f => f.insight),
      domains: Array.from(new Set(
        feedback.flatMap(f => f.story_domains || [])
      ))
    };

    // Request synthesis from Claude
    const synthesis = await askClaude(
      `Based on Doug's feedback from the past week on his daily paper, generate a brief weekly synthesis. ` +
      `Highlight key patterns in what he engaged with, what he dismissed, and any insights he expressed.\n\n` +
      `Feedback summary:\n${JSON.stringify(feedbackSummary, null, 2)}\n\n` +
      `Keep it concise, insightful, and actionable for refining his news curation.`
    );

    logger.info('Weekly synthesis generated');
    return synthesis;
  } catch (error) {
    logger.error(`Error generating weekly synthesis: ${error.message}`);
    throw error;
  }
}
