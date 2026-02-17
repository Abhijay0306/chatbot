require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),

  // DeepSeek API
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.1,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS, 10) || 500,
    maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS, 10) || 2000,
  },

  // RAG
  rag: {
    chunkSize: parseInt(process.env.CHUNK_SIZE, 10) || 512,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP, 10) || 50,
    topK: parseInt(process.env.TOP_K, 10) || 5,
    relevanceThreshold: parseFloat(process.env.RELEVANCE_THRESHOLD) || 0.3,
  },

  // Security
  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 20,
  },

  // Cache
  cache: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 100,
    ttlMs: parseInt(process.env.CACHE_TTL_MS, 10) || 3600000,
  },

  // Paths
  paths: {
    dataDir: require('path').resolve(__dirname, '..', 'data'),
    documentsDir: require('path').resolve(__dirname, '..', 'data', 'Documents'),
    indexDir: require('path').resolve(__dirname, '..', 'data', 'index'),
    catalogFile: require('path').resolve(__dirname, '..', 'data', 'product_catalog.json'),
  },
};

// Validate critical config
function validateConfig() {
  const warnings = [];
  if (!config.deepseek.apiKey) {
    warnings.push('DEEPSEEK_API_KEY is not set. LLM calls will fail.');
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[CONFIG WARNING] ${w}`));
  }
  return warnings.length === 0;
}

module.exports = { config, validateConfig };
