const OpenAI = require('openai');
const { config } = require('../config');
const { buildSystemPrompt } = require('./system_prompt');
const { logger } = require('../utils/logger');

let client = null;

/**
 * Initialize the DeepSeek API client (OpenAI-compatible).
 */
function initLLMClient() {
    if (client) return client;

    if (!config.deepseek.apiKey) {
        logger.error('DEEPSEEK_API_KEY is not set. Cannot initialize LLM client.');
        throw new Error('DEEPSEEK_API_KEY is required');
    }

    client = new OpenAI({
        apiKey: config.deepseek.apiKey,
        baseURL: config.deepseek.baseUrl,
    });

    logger.info(`DeepSeek client initialized (model: ${config.deepseek.model})`);
    return client;
}

/**
 * Generate a non-streaming response from DeepSeek.
 */
async function generateResponse(userQuery, context, options = {}) {
    const llm = initLLMClient();
    const {
        extraSystemPrompt = '',
        maxTokens = config.deepseek.maxTokens,
        temperature = config.deepseek.temperature,
    } = options;

    const systemPrompt = buildSystemPrompt(extraSystemPrompt);

    const contextBlock = context
        ? `\n\n## PROVIDED CONTEXT (answer ONLY from this):\n\n${context}`
        : '\n\n## PROVIDED CONTEXT:\nNo relevant context found. Inform the user that you cannot find the requested information.';

    const messages = [
        { role: 'system', content: systemPrompt + contextBlock },
        { role: 'user', content: userQuery },
    ];

    try {
        const response = await llm.chat.completions.create({
            model: config.deepseek.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            top_p: 0.9,
        });

        const content = response.choices?.[0]?.message?.content || '';
        const usage = response.usage || {};

        logger.info('DeepSeek response generated', {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
        });

        return {
            content,
            usage: {
                inputTokens: usage.prompt_tokens || 0,
                outputTokens: usage.completion_tokens || 0,
                totalTokens: usage.total_tokens || 0,
            },
        };
    } catch (error) {
        logger.error(`DeepSeek API error: ${error.message}`);

        if (error.status === 429) {
            return {
                content: "I'm experiencing high demand right now. Please try again in a moment.",
                usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                error: 'rate_limited',
            };
        }

        return {
            content: "I'm temporarily unable to process your request. Please try again shortly.",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            error: error.message,
        };
    }
}

/**
 * Generate a streaming response from DeepSeek.
 * Returns an async iterable of content chunks.
 *
 * @param {string} userQuery - The sanitized user query
 * @param {string} context - Retrieved context from RAG
 * @param {object} options - Additional options
 * @returns {AsyncIterable} Stream of { chunk, done } objects
 */
async function generateResponseStream(userQuery, context, options = {}) {
    const llm = initLLMClient();
    const {
        extraSystemPrompt = '',
        maxTokens = config.deepseek.maxTokens,
        temperature = config.deepseek.temperature,
    } = options;

    const systemPrompt = buildSystemPrompt(extraSystemPrompt);

    const contextBlock = context
        ? `\n\n## PROVIDED CONTEXT (answer ONLY from this):\n\n${context}`
        : '\n\n## PROVIDED CONTEXT:\nNo relevant context found. Inform the user that you cannot find the requested information.';

    const messages = [
        { role: 'system', content: systemPrompt + contextBlock },
        { role: 'user', content: userQuery },
    ];

    const stream = await llm.chat.completions.create({
        model: config.deepseek.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        top_p: 0.9,
        stream: true,
    });

    return stream;
}

module.exports = { initGrokClient: initLLMClient, initLLMClient, generateResponse, generateResponseStream };
