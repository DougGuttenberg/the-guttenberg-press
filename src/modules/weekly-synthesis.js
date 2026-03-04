import { createLogger } from '../lib/logger.js';
import { loadFeedbackRange, loadPaper, loadWeights, saveWeights } from '../lib/storage.js';
import { sendMessage, initBot } from '../lib/telegram-client.js';

const logger = createLogger('weekly-synthesis');

/**
 * Get the date range for the past week (Sunday to Saturday).
 */
function getWeekRange() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // yesterday
  const start = new Date(end);
  start.setDate(start.getDate() - 6); // 7 days ago

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

/**
 * Gather all feedback and papers from the past week.
 */
function gatherWeeklyData(startDate, endDate) {
  const feedback = loadFeedbackRange(startDate, endDate);
  const papers = [];

  // Load each day's paper
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const paper = loadPaper(dateStr);
    if (paper) {
      papers.push({ date: dateStr, paper });
    }
  }

  return { feedback, papers };
}

/**
 * Analyze feedback patterns from the week.
 */
function analyzeFeedback(feedback, papers) {
  const hits = feedback.filter(f => f.reaction === 'hit');
  const misses = feedback.filter(f => f.reaction === 'miss');
  const notes = feedback.filter(f => f.reaction === 'note' && f.note);

  // Track source hit rates
  const sourceStats = {};
  const domainStats = {};

  for (const fb of [...hits, ...misses]) {
    // Try to find the story from its paper
    const paper = papers.find(p => p.date === fb.date)?.paper;
    if (!paper) continue;

    const sections = paper.daily_selections || paper.formatted_paper?.daily_selections;
    if (!sections) continue;

    // Flatten all stories
    const allStories = [];
    for (const section of Object.values(sections)) {
      if (Array.isArray(section)) allStories.push(...section);
      else if (section) allStories.push(section);
    }

    const story = allStories[fb.story_index];
    if (!story) continue;

    // Track sources
    const sources = story.sources || [];
    for (const src of sources) {
      const name = src.name || 'Unknown';
      if (!sourceStats[name]) sourceStats[name] = { hits: 0, misses: 0 };
      if (fb.reaction === 'hit') sourceStats[name].hits++;
      else sourceStats[name].misses++;
    }

    // Track domains
    const domains = story.domains || [];
    for (const domain of domains) {
      if (!domainStats[domain]) domainStats[domain] = { hits: 0, misses: 0 };
      if (fb.reaction === 'hit') domainStats[domain].hits++;
      else domainStats[domain].misses++;
    }
  }

  return {
    total_feedback: feedback.length,
    hits: hits.length,
    misses: misses.length,
    notes: notes.length,
    noteTexts: notes.map(n => n.note),
    sourceStats,
    domainStats,
  };
}

/**
 * Generate suggested weight adjustments based on feedback.
 */
function suggestAdjustments(analysis) {
  const suggestions = [];
  const currentWeights = loadWeights();

  // Source suggestions
  for (const [source, stats] of Object.entries(analysis.sourceStats)) {
    const total = stats.hits + stats.misses;
    if (total < 2) continue; // Not enough data

    const hitRate = stats.hits / total;
    if (hitRate >= 0.8 && total >= 3) {
      suggestions.push(`📈 "${source}" — ${Math.round(hitRate * 100)}% hit rate (${stats.hits}/${total}). Consider prioritizing.`);
    } else if (hitRate <= 0.3 && total >= 3) {
      suggestions.push(`📉 "${source}" — ${Math.round(hitRate * 100)}% hit rate (${stats.hits}/${total}). Consider deprioritizing.`);
    }
  }

  // Domain suggestions
  for (const [domain, stats] of Object.entries(analysis.domainStats)) {
    const total = stats.hits + stats.misses;
    if (total < 2) continue;

    const hitRate = stats.hits / total;
    if (hitRate >= 0.75) {
      suggestions.push(`🎯 "${domain}" domain stories well-received (${Math.round(hitRate * 100)}% hit rate)`);
    } else if (hitRate <= 0.25) {
      suggestions.push(`⚠️ "${domain}" domain stories missing the mark (${Math.round(hitRate * 100)}% hit rate)`);
    }
  }

  return suggestions;
}

/**
 * Build and send the weekly synthesis report via Telegram.
 */
export async function runWeeklySynthesis() {
  const { startDate, endDate } = getWeekRange();
  logger.info(`Running weekly synthesis for ${startDate} to ${endDate}`);

  const { feedback, papers } = gatherWeeklyData(startDate, endDate);

  if (feedback.length === 0) {
    logger.info('No feedback this week — skipping synthesis');
    initBot();
    await sendMessage('📊 <b>Weekly Synthesis</b>\n\nNo feedback received this week. Tap 👍/👎 on daily stories to start training!', {
      parse_mode: 'HTML',
    });
    return { feedback_count: 0 };
  }

  const analysis = analyzeFeedback(feedback, papers);
  const suggestions = suggestAdjustments(analysis);

  // Build report
  const dateRange = `${new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(endDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  let report = `📊 <b>WEEKLY SYNTHESIS — ${dateRange}</b>\n\n`;
  report += `<b>Your engagement:</b>\n`;
  report += `👍 Hits: ${analysis.hits}\n`;
  report += `👎 Misses: ${analysis.misses}\n`;
  report += `💬 Notes: ${analysis.notes}\n`;
  report += `📰 Papers delivered: ${papers.length}\n\n`;

  if (analysis.noteTexts.length > 0) {
    report += `<b>Your notes this week:</b>\n`;
    analysis.noteTexts.slice(0, 5).forEach(note => {
      report += `• "${note.substring(0, 100)}${note.length > 100 ? '...' : ''}"\n`;
    });
    report += '\n';
  }

  if (suggestions.length > 0) {
    report += `<b>Patterns spotted:</b>\n`;
    suggestions.forEach(s => { report += `${s}\n`; });
    report += '\n';
  }

  if (analysis.total_feedback < 10) {
    report += `💡 <i>More feedback = better paper. Try rating at least 3-4 stories daily.</i>`;
  }

  // Send via Telegram
  initBot();
  await sendMessage(report, { parse_mode: 'HTML' });

  logger.info(`Weekly synthesis sent: ${analysis.total_feedback} feedback items analyzed`);

  return {
    feedback_count: analysis.total_feedback,
    analysis,
    suggestions,
  };
}

export default { runWeeklySynthesis };
