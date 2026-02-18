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
  const systemPrompt = `You are an editorial assistant for a senior advertising/creative-tech executive. Extract precise factual assertions that reveal system-level shifts, early signals, and cross-domain connections. Avoid surface-level summaries.`;

  const batchData = batch.map((article) => ({
    source: article.source || 'Unknown',
    title: article.title || 'Untitled',
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
Category: ${article.category}
Manual Send: ${article.manual_send}
Content: ${article.content}
`
    )
    .join('\n---\n');

  return `Analyze the following articles and extract 2-5 key factual assertions from each.

${articlesText}

For each article, identify precise factual claims that reveal:
- System-level shifts in their domains
- Early signals of emerging trends
- Cross-domain connections and implications

Return a JSON array with this structure:
[
  {
    "assertion": "specific factual claim",
    "evidence_type": "primary_source|analysis|community_signal",
    "confidence": "high|medium|low",
    "domains": ["array of relevant domains from: ai, business, sports, culture, personal"],
    "source_article": "title of the source article",
    "source_name": "name of the news source",
    "manual_send": boolean,
    "doug_note": "optional insight or null"
  }
]

Return ONLY the JSON array, no additional text.`;
}

