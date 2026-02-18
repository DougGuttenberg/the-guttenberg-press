import { askClaudeJSON } from '../lib/claude-client.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('normalize');

/**
 * Normalize raw articles by extracting key factual assertions using Claude AI
 * @param {Object} articlesData - The input data containing articles and metadata
 * @param {Array} articlesData.articles - Array of article objects
 * @param {Array} articlesData.scores - Array of relevance scores
 * @param {number} articlesData.count - Total number of articles
 * @param {string} articlesData.timestamp - ISO timestamp of data collection
 * @returns {Promise<Object>} Normalized assertions with metadata
 */
export default async function normalize(articlesData) {
  const { articles, count, timestamp } = articlesData;

  if (!articles || !Array.isArray(articles) || articles.length === 0) {
    logger.warn('No articles provided for normalization');
    return {
      assertions: [],
      count: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const batchSize = 5;
  const totalBatches = Math.ceil(articles.length / batchSize);
  const allAssertions = [];

  try {
    // Process articles in batches of 5
    for (let i = 0; i < articles.length; i += batchSize) {
      const batchIndex = Math.floor(i / batchSize) + 1;
      logger.info(`Normalizing batch ${batchIndex}/${totalBatches}`);

      const batch = articles.slice(i, i + batchSize);
      try {
        const batchAssertions = await processBatch(batch);
        allAssertions.push(...batchAssertions);
      } catch (error) {
        logger.warn(
          `Batch ${batchIndex}/${totalBatches} processing failed: ${error.message}`
        );
        // Continue with remaining batches
        continue;
      }
    }

    logger.info(
      `Normalization complete: extracted ${allAssertions.length} assertions`
    );

    return {
      assertions: allAssertions,
      count: allAssertions.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`Critical error during normalization: ${error.message}`);
    throw error;
  }
}

/**
 * Process a single batch of articles
 * @param {Array} batch - Array of article objects for this batch
 * @param {Array} batchScores - Relevance scores for articles in batch
 * @returns {Promise<Array>} Array of assertion objects
 */
async function processBatch(batch) {
  const systemPrompt = `You are a sharp news editor extracting concrete, specific facts from articles. Focus on WHAT HAPPENED — names, companies, numbers, dates, decisions, launches, deals. Never produce vague topic summaries like "AI continues to evolve." Every assertion must be a specific, verifiable claim about a real event or development.`;

  const batchData = batch.map((article) => ({
    source: article.source || 'Unknown',
    title: article.title || 'Untitled',
    link: article.link || null,
    content: (article.content || '').substring(0, 2000),
    category: article.category || 'uncategorized',
    manual_send: article.manual_send || false,
  }));

  const userPrompt = buildPrompt(batchData);

  try {
    const response = await askClaudeJSON(userPrompt, {
      system: systemPrompt,
      temperature: 0.7,
      maxTokens: 2000,
    });

    // askClaudeJSON returns parsed JSON directly
    const assertions = Array.isArray(response) ? response : [];

    // Validate assertions have required fields
    const validatedAssertions = assertions.filter((a) =>
      a.assertion && typeof a.assertion === 'string' && a.assertion.length > 0
    );

    return validatedAssertions;
  } catch (error) {
    logger.error(`Error processing batch: ${error.message}`);
    throw error;
  }
}

/**
 * Build the prompt for Claude to extract assertions
 * @param {Array} batchData - Processed batch data with article info
 * @returns {string} Formatted prompt
 */
function buildPrompt(batchData) {
  const articlesText = batchData
    .map(
      (article, index) => `
ARTICLE ${index + 1}:
Source: ${article.source}
Title: ${article.title}
URL: ${article.link || 'none'}
Category: ${article.category}
Manual Send: ${article.manual_send}
Content: ${article.content}
`
    )
    .join('\n---\n');

  return `Extract 2-5 specific factual claims from each article. Be CONCRETE — include names, companies, dollar amounts, dates, product names, scores, decisions. Never write vague summaries.

BAD assertion: "AI companies are developing new agent frameworks"
GOOD assertion: "Anthropic released the Claude Agent SDK on Feb 10, enabling developers to build autonomous AI agents with tool-use capabilities"

BAD assertion: "NFL teams are making roster changes ahead of the draft"
GOOD assertion: "Jets traded their 2027 second-round pick to the Rams for edge rusher Jared Verse"

${articlesText}

For each article, extract the most newsworthy specific claims.

Assign each assertion to its PRIMARY domain — pick the single best fit:
- "ai" = AI models, tools, companies (Anthropic, OpenAI, Google AI, etc.)
- "business" = advertising, media, deals, earnings, industry moves
- "sports" = games, trades, scores, NFL/NBA/MLB, team news
- "culture" = music, film, food, art, entertainment
- "personal" = health, productivity, psychology, personal development

Return a JSON array:
[
  {
    "assertion": "specific factual claim with names, numbers, dates",
    "evidence_type": "primary_source|analysis|community_signal",
    "confidence": "high|medium|low",
    "domains": ["primary_domain"],
    "source_article": "title of the source article",
    "source_name": "name of the news source",
    "source_url": "URL of the source article or null",
    "manual_send": boolean,
    "doug_note": "optional insight or null"
  }
]

Return ONLY the JSON array.`;
}

