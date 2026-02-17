const { LRUCache } = require('lru-cache');
const crypto = require('crypto');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * Query Cache — LRU cache for frequent queries.
 * Reduces LLM API calls and latency for repeated questions.
 */
class QueryCache {
    constructor(options = {}) {
        const { maxSize = config.cache.maxSize, ttlMs = config.cache.ttlMs } = options;

        this.cache = new LRUCache({
            max: maxSize,
            ttl: ttlMs,
        });

        this.stats = { hits: 0, misses: 0 };
    }

    /**
     * Generate a cache key from a normalized query.
     */
    _key(query) {
        const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
        return crypto.createHash('md5').update(normalized).digest('hex');
    }

    /**
     * Get a cached response.
     */
    get(query) {
        const key = this._key(query);
        const cached = this.cache.get(key);

        if (cached) {
            this.stats.hits++;
            logger.debug('Cache HIT', { query: query.substring(0, 50) });
            return cached;
        }

        this.stats.misses++;
        return null;
    }

    /**
     * Set a response in cache.
     */
    set(query, response) {
        const key = this._key(query);
        this.cache.set(key, {
            response,
            cachedAt: Date.now(),
        });
        logger.debug('Cache SET', { query: query.substring(0, 50) });
    }

    /**
     * Clear the cache.
     */
    clear() {
        this.cache.clear();
        logger.info('Cache cleared');
    }

    /**
     * Get cache statistics.
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits + this.stats.misses > 0
                ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1) + '%'
                : '0%',
        };
    }
}

module.exports = { QueryCache };
