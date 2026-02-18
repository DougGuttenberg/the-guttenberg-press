import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from './logger.js';

const log = createLogger('claude-client');

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Send a prompt to Claude and get a text response.
 * @param {string} prompt - The user message
 * @param {object} options - Optional overrides
 * @param {string} options.system - System prompt
 * @param {string} options.model - Model override
 * @param {number} options.maxTokens - Max tokens
 * @param {number} options.temperature - Temperature
 * @returns {Promise<string>} The text response
 */
export async function askClaude(prompt, options = {}) {
  const api = getClient();
  const model = options.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.3;

  const messages = [{ role: 'user', content: prompt }];

  const requestParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages
  };

  if (options.system) {
    requestParams.system = options.system;
  }

  try {
    log.debug(`Sending request to ${model}`, { promptLength: prompt.length });
    const response = await api.messages.create(requestParams);
    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');
    log.debug(`Response received`, {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    });
    return text;
  } catch (error) {
    log.error(`Claude API error: ${error.message}`);
    throw error;
  }
}

/**
 * Send a prompt and parse the response as JSON.
 * Handles markdown code fences around JSON.
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function askClaudeJSON(prompt, options = {}) {
  const text = await askClaude(prompt, options);

  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    log.error('Failed to parse Claude response as JSON', {
      responsePreview: text.substring(0, 200)
    });
    throw new Error(`Claude response was not valid JSON: ${error.message}`);
  }
}

/**
 * Process items in batches with Claude.
 * @param {Array} items - Items to process
 * @param {number} batchSize - Items per batch
 * @param {function} promptBuilder - (batch) => prompt string
 * @param {object} options - Claude options
 * @returns {Promise<Array>} Collected results
 */
export async function batchProcess(items, batchSize, promptBuilder, options = {}) {
  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    log.debug(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);

    const prompt = promptBuilder(batch);
    const result = await askClaudeJSON(prompt, options);
    if (Array.isArray(result)) {
      results.push(...result);
    } else {
      results.push(result);
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Run multiple Claude calls in parallel.
 * @param {Array<{prompt: string, options?: object}>} requests
 * @returns {Promise<Array<string>>}
 */
export async function parallelAsk(requests) {
  return Promise.all(
    requests.map(({ prompt, options }) => askClaude(prompt, options))
  );
}

/**
 * Run multiple Claude calls in parallel, parse as JSON.
 * @param {Array<{prompt: string, options?: object}>} requests
 * @returns {Promise<Array<object>>}
 */
export async function parallelAskJSON(requests) {
  return Promise.all(
    requests.map(({ prompt, options }) => askClaudeJSON(prompt, options))
  );
}

export default { askClaude, askClaudeJSON, batchProcess, parallelAsk, parallelAskJSON };
