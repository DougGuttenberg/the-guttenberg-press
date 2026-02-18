import { createLogger } from '../lib/logger.js';
import { format } from 'date-fns';

const logger = createLogger('format-paper');

function formatDateHeader(timestamp) {
  const date = new Date(timestamp);
  return format(date, 'EEEE, MMMM dd, yyyy');
}

function buildSection(title, emoji, stories) {
  if (!stories || stories.length === 0) {
    return '';
  }

  let section = `\n${emoji} ${title}\n\n`;
  stories.forEach((story, index) => {
    const linkText = story.links?.primary ? `🔗 ${story.links.primary}` : '🔗 [No link available]';
    section += `${story.rank}. ${story.headline}\n`;
    section += `   → Why: ${story.why_this_matters}\n`;
    section += `   💡 ${story.confidence_label} | ${story.source_count} sources\n`;
    section += `   ${linkText}\n\n`;
  });

  return section;
}

function buildSportsSection(title, emoji, stories, scoresData) {
  if (!stories || stories.length === 0) {
    return '';
  }

  let section = `\n${emoji} ${title}\n\n`;

  // Add scores if available
  if (scoresData && scoresData.length > 0) {
    section += 'YESTERDAY\'S SCORES:\n';
    scoresData.forEach(score => {
      const result = score.result === 'W' ? '✅' : '❌';
      section += `${result} ${score.team} ${score.score}\n`;
    });
    section += '\n';
  }

  stories.forEach(story => {
    const linkText = story.links?.primary ? `🔗 ${story.links.primary}` : '🔗 [No link available]';
    section += `${story.rank}. ${story.headline}\n`;
    section += `   → Why: ${story.why_this_matters}\n`;
    section += `   💡 ${story.confidence_label} | ${story.source_count} sources\n`;
    section += `   ${linkText}\n\n`;
  });

  return section;
}

function buildTextPaper(rankedData, scoresData) {
  const dateHeader = formatDateHeader(rankedData.timestamp);
  const selections = rankedData.daily_selections;

  let paper = `📰 YOUR PAPER — ${dateHeader}\n`;
  paper += `\n${'═'.repeat(27)}\n`;

  // Front Page
  paper += buildSection('FRONT PAGE', '🔴', selections.front_page);
  paper += `${'═'.repeat(27)}\n`;

  // Business & AI
  paper += buildSection('BUSINESS & AI SYSTEMS', '💼', selections.business);
  paper += `${'═'.repeat(27)}\n`;

  // Sports
  paper += buildSportsSection('JETS & NFL', '🏈', selections.sports, scoresData);
  paper += `${'═'.repeat(27)}\n`;

  // Culture
  paper += buildSection('CULTURE', '🎵', selections.culture);
  paper += `${'═'.repeat(27)}\n`;

  // Personal (only if present)
  if (selections.personal && selections.personal.length > 0) {
    paper += buildSection('PERSONAL EDGE', '🍳', selections.personal);
    paper += `${'═'.repeat(27)}\n`;
  }

  // Surprise pick if present
  if (selections.surprise_pick) {
    paper += `\n✨ SURPRISE PICK\n\n`;
    const surprise = selections.surprise_pick;
    const linkText = surprise.links?.primary ? `🔗 ${surprise.links.primary}` : '🔗 [No link available]';
    paper += `${surprise.headline}\n`;
    paper += `   → Why: ${surprise.why_this_matters}\n`;
    paper += `   💡 ${surprise.confidence_label} | ${surprise.source_count} sources\n`;
    paper += `   ${linkText}\n\n`;
    paper += `${'═'.repeat(27)}\n`;
  }

  paper += `\nReact to train your paper:\n`;
  paper += `👍 Mattered | 👎 Noise | 💾 Save | 💬 Note\n`;

  return paper;
}

function buildHtmlPaper(rankedData, scoresData) {
  const dateHeader = formatDateHeader(rankedData.timestamp);
  const selections = rankedData.daily_selections;

  const htmlStyle = `
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        background-color: #f9f9f9;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .container {
        background-color: #ffffff;
        border-radius: 8px;
        padding: 30px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .header {
        text-align: center;
        margin-bottom: 30px;
        border-bottom: 3px solid #333;
        padding-bottom: 20px;
      }
      .header h1 {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
      }
      .date {
        color: #666;
        font-size: 14px;
        margin-top: 8px;
      }
      .section {
        margin-bottom: 30px;
      }
      .section h2 {
        font-size: 18px;
        font-weight: bold;
        margin: 20px 0 15px 0;
        border-bottom: 2px solid #ddd;
        padding-bottom: 10px;
      }
      .story {
        margin-bottom: 20px;
        padding: 15px;
        background-color: #f5f5f5;
        border-radius: 4px;
      }
      .story h3 {
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: 600;
      }
      .story-meta {
        font-size: 13px;
        color: #666;
        margin: 8px 0;
      }
      .story-why {
        font-size: 14px;
        margin: 10px 0;
        font-style: italic;
        color: #555;
      }
      .story-link {
        display: inline-block;
        margin-top: 10px;
        font-size: 13px;
      }
      .story-link a {
        color: #0066cc;
        text-decoration: none;
      }
      .story-link a:hover {
        text-decoration: underline;
      }
      .scores {
        background-color: #f0f0f0;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 15px;
        font-size: 13px;
        font-family: 'Courier New', monospace;
      }
      .score-item {
        margin: 4px 0;
      }
      .surprise {
        background-color: #fff3cd;
        border: 2px solid #ffc107;
        padding: 15px;
        border-radius: 4px;
        margin: 20px 0;
      }
      .surprise h3 {
        color: #856404;
        margin-top: 0;
      }
      .footer {
        margin-top: 30px;
        padding-top: 20px;
        border-top: 2px solid #ddd;
        text-align: center;
        font-size: 13px;
        color: #666;
      }
      .emoji {
        margin-right: 6px;
      }
    </style>
  `;

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Daily Paper</title>
  ${htmlStyle}
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="emoji">📰</span>YOUR PAPER</h1>
      <div class="date">${dateHeader}</div>
    </div>
`;

  // Helper function to add section HTML
  function addSectionHtml(title, emoji, stories) {
    if (!stories || stories.length === 0) {
      return '';
    }
    let html = `<div class="section">
      <h2><span class="emoji">${emoji}</span>${title}</h2>
`;
    stories.forEach(story => {
      html += `
      <div class="story">
        <h3>${story.rank}. ${story.headline}</h3>
        <div class="story-why">→ Why: ${story.why_this_matters}</div>
        <div class="story-meta">💡 ${story.confidence_label} | ${story.source_count} sources</div>
`;
      if (story.links?.primary) {
        html += `<div class="story-link"><a href="${story.links.primary}" target="_blank">🔗 Read more</a></div>`;
      }
      html += `</div>
`;
    });
    html += `</div>
`;
    return html;
  }

  // Front Page
  html += addSectionHtml('FRONT PAGE', '🔴', selections.front_page);

  // Business & AI
  html += addSectionHtml('BUSINESS & AI SYSTEMS', '💼', selections.business);

  // Sports
  if (selections.sports && selections.sports.length > 0) {
    html += `<div class="section">
      <h2><span class="emoji">🏈</span>JETS & NFL</h2>
`;
    if (scoresData && scoresData.length > 0) {
      html += `<div class="scores">
        <strong>Yesterday's Scores:</strong>
`;
      scoresData.forEach(score => {
        const result = score.result === 'W' ? '✅' : '❌';
        html += `<div class="score-item">${result} ${score.team} ${score.score}</div>
`;
      });
      html += `</div>
`;
    }
    selections.sports.forEach(story => {
      html += `
      <div class="story">
        <h3>${story.rank}. ${story.headline}</h3>
        <div class="story-why">→ Why: ${story.why_this_matters}</div>
        <div class="story-meta">💡 ${story.confidence_label} | ${story.source_count} sources</div>
`;
      if (story.links?.primary) {
        html += `<div class="story-link"><a href="${story.links.primary}" target="_blank">🔗 Read more</a></div>`;
      }
      html += `</div>
`;
    });
    html += `</div>
`;
  }

  // Culture
  html += addSectionHtml('CULTURE', '🎵', selections.culture);

  // Personal (only if present)
  if (selections.personal && selections.personal.length > 0) {
    html += addSectionHtml('PERSONAL EDGE', '🍳', selections.personal);
  }

  // Surprise pick if present
  if (selections.surprise_pick) {
    const surprise = selections.surprise_pick;
    html += `<div class="surprise">
      <h3>✨ SURPRISE PICK</h3>
      <p><strong>${surprise.headline}</strong></p>
      <div class="story-why">→ Why: ${surprise.why_this_matters}</div>
      <div class="story-meta">💡 ${surprise.confidence_label} | ${surprise.source_count} sources</div>
`;
    if (surprise.links?.primary) {
      html += `<div class="story-link"><a href="${surprise.links.primary}" target="_blank">🔗 Read more</a></div>`;
    }
    html += `</div>
`;
  }

  html += `
    <div class="footer">
      <p>React to train your paper:<br>
      👍 Mattered | 👎 Noise | 💾 Save | 💬 Note</p>
    </div>
  </div>
</body>
</html>
`;

  return html;
}

export default async function formatPaper(rankedData, scoresData = null) {
  const startTime = Date.now();
  logger.info('Starting paper formatting');

  if (!rankedData || !rankedData.daily_selections) {
    throw new Error('Invalid ranked data: missing daily_selections');
  }

  const textPaper = buildTextPaper(rankedData, scoresData);
  const htmlPaper = buildHtmlPaper(rankedData, scoresData);

  const hasSurprisePick = rankedData.daily_selections.surprise_pick !== null;
  const storyCount = rankedData.total_stories;

  const result = {
    formatted_paper: {
      text: textPaper,
      html: htmlPaper,
      metadata: {
        story_count: storyCount,
        has_surprise_pick: hasSurprisePick,
        total_length_chars: textPaper.length
      }
    },
    timestamp: new Date().toISOString()
  };

  const elapsed = Date.now() - startTime;
  logger.info(`Formatting complete in ${elapsed}ms. Generated ${storyCount} stories.`);

  return result;
}
