import 'dotenv/config';
import fetch from 'node-fetch';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!botToken || !chatId) {
  console.error('❌ Missing configuration');
  console.error('Required in .env:');
  console.error('  - TELEGRAM_BOT_TOKEN');
  console.error('  - TELEGRAM_CHAT_ID');
  process.exit(1);
}

// Build a sample paper with fake data
const samplePaper = {
  date: new Date().toISOString().split('T')[0],
  frontPage: [
    {
      headline: 'Tech Giant Announces Revolutionary AI Breakthrough',
      summary:
        'Scientists discover new approach to machine learning that could transform the industry. The advancement promises 10x performance improvements.',
      source: 'TechNews Daily',
    },
    {
      headline: 'Global Climate Summit Reaches Historic Agreement',
      summary:
        'World leaders commit to ambitious targets for carbon reduction. New framework aims to limit warming to 1.5°C by 2050.',
      source: 'Environment Report',
    },
    {
      headline: 'Stock Markets Close at Record Highs',
      summary:
        'Major indices surge following positive economic data. Investors optimistic about first quarter earnings reports.',
      source: 'Finance Weekly',
    },
  ],
  business: [
    {
      headline: 'Startup Raises $500M in Series C Funding',
      summary:
        'Cloud infrastructure company valued at $5B after latest investment round. Plans expansion into Asian markets.',
      source: 'Business Insider',
    },
    {
      headline: 'Merger Creates Industry Giant',
      summary:
        'Two major corporations announce combination creating $100B powerhouse. Deal expected to close by Q3 2026.',
      source: 'Market Watch',
    },
  ],
  sports: [
    {
      headline: 'Championship Game Sets Viewership Record',
      summary: 'Game 7 finale breaks all-time streaming records with 50M viewers worldwide.',
      score: { team1: 'City United', score1: 3, team2: 'Capital FC', score2: 2 },
      source: 'Sports Central',
    },
  ],
  culture: [
    {
      headline: 'New Museum Exhibition Celebrates Digital Art',
      summary:
        'Groundbreaking exhibition explores intersection of technology and creativity. Open through December at Metropolitan Museum.',
      source: 'Arts Daily',
    },
  ],
};

async function sendTestPaper() {
  console.log('Preparing test paper...\n');

  // Format the paper as a readable message
  let message = `📰 *Daily Paper Test - ${samplePaper.date}*\n\n`;

  message += `*Front Page*\n`;
  samplePaper.frontPage.forEach((story, i) => {
    message += `${i + 1}. *${story.headline}*\n${story.summary}\n_${story.source}_\n\n`;
  });

  message += `*Business*\n`;
  samplePaper.business.forEach((story, i) => {
    message += `${i + 1}. *${story.headline}*\n${story.summary}\n_${story.source}_\n\n`;
  });

  message += `*Sports*\n`;
  samplePaper.sports.forEach((story, i) => {
    message += `${i + 1}. *${story.headline}*\n`;
    if (story.score) {
      message += `${story.score.team1} ${story.score.score1} - ${story.score.score2} ${story.score.team2}\n`;
    }
    message += `${story.summary}\n_${story.source}_\n\n`;
  });

  message += `*Culture*\n`;
  samplePaper.culture.forEach((story, i) => {
    message += `${i + 1}. *${story.headline}*\n${story.summary}\n_${story.source}_\n\n`;
  });

  message += `\n✓ This is a test message from Daily Paper`;

  try {
    console.log('Sending to Telegram...');
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    const data = await response.json();

    if (data.ok) {
      console.log('✅ Test paper sent successfully!\n');
      console.log('Message ID:', data.result.message_id);
      console.log('Chat ID:', data.result.chat.id);
    } else {
      console.error('❌ Failed to send test paper');
      console.error('Error:', data.description);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error sending to Telegram:', error.message);
    process.exit(1);
  }
}

sendTestPaper();
