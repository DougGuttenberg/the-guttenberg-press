import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createLogger } from './logger.js';

const log = createLogger('claude-client');

let anthropicClient = null;
let deepseekClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function getDeepSeekClient() {
  if (!deepseekClient) {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY is not set in environment variables');
    }
    deepseekClient = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
  }
  return deepseekClient;
}

/**
 * Send a prompt via DeepSeek (OpenAI-compatible API)
 */
async function askDeepSeek(prompt, options = {}) {
  const api = getDeepSeekClient();
  const model = options.model || 'deepseek-chat';
  const maxTokens = options.maxTokens || 4096;
  const temperature = options.temperature ?? 0.3;

  const messages = [];
  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    log.debug(`Sending request to DeepSeek ${model}`, { promptLength: prompt.length });
    const response = await api.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    });
    const text = response.choices[0]?.message?.content || '';
    log.debug(`DeepSeek response received`, {
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });
    return text;
  } catch (error) {
    log.error(`DeepSeek API error: ${error.message}`);
    throw error;
  }
}

/**
 * Send a prompt to Claude and get a text response.
 * @param {string} prompt - The user message
 * @param {object} options - Optional overrides
 * @param {string} options.system - System prompt
 * @param {string} options.model - Model override
 * @param {number} options.maxTokens - Max tokens
 * @param {number} options.temperature - Temperature
 * @param {string} options.provider - 'claude' (default) or 'deepseek'
 * @returns {Promise<string>} The text response
 */
export async function askClaude(prompt, options = {}) {
  const provider = options.provider || 'claude';

  if (provider === 'deepseek') {
    return askDeepSeek(prompt, options);
  }

  const api = getAnthropicClient();
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
 * @param {object} options - includes optional provider: 'claude' | 'deepseek'
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
    const provider = options.provider || 'claude';
    log.error(`Failed to parse ${provider} response as JSON`, {
      responsePreview: text.substring(0, 200)
    });
    throw new Error(`${provider} response was not valid JSON: ${error.message}`);
  }
}

/**
 * Process items in batches with an LLM.
 * @param {Array} items - Items to process
 * @param {number} batchSize - Items per batch
 * @param {function} promptBuilder - (batch) => prompt string
 * @param {object} options - LLM options (includes optional provider)
 * @returns {Promise<Array>} Collected results
 */
export async function batchProcess(items, batchSize, promptBuilder, options = {}) {
  const results = [];
  const totalBatches = Math.ceil(items.length / batchSize);
  const provider = options.provider || 'claude';

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    log.debug(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items) via ${provider}`);

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
 * Run multiple calls in parallel.
 * @param {Array<{prompt: string, options?: object}>} requests
 * @returns {Promise<Array<string>>}
 */
export async function parallelAsk(requests) {
  return Promise.all(
    requests.map(({ prompt, options }) => askClaude(prompt, options))
  );
}

/**
 * Run multiple calls in parallel, parse as JSON.
 * @param {Array<{prompt: string, options?: object}>} requests
 * @returns {Promise<Array<object>>}
 */
export async function parallelAskJSON(requests) {
  return Promise.all(
    requests.map(({ prompt, options }) => askClaudeJSON(prompt, options))
  );
}

export default { askClaude, askClaudeJSON, batchProcess, parallelAsk, parallelAskJSON };
