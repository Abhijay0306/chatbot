const { logger } = require('../utils/logger');

let pipeline = null;
let embedderInstance = null;

/**
 * Initialize the embedding model (all-MiniLM-L6-v2 via Transformers.js).
 * Downloads model on first run (~80MB).
 */
async function initEmbedder() {
    if (embedderInstance) return embedderInstance;

    logger.info('Initializing embedding model (all-MiniLM-L6-v2)...');
    const { pipeline: pipelineFn } = await import('@xenova/transformers');
    pipeline = pipelineFn;

    embedderInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true,
    });

    logger.info('Embedding model loaded successfully');
    return embedderInstance;
}

/**
 * Embed a single text string into a 384-dim vector.
 */
async function embed(text) {
    const model = await initEmbedder();
    const output = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

/**
 * Embed a batch of texts with progress logging.
 */
async function embedBatch(texts, batchLabel = '') {
    const model = await initEmbedder();
    const embeddings = [];
    const total = texts.length;

    for (let i = 0; i < total; i++) {
        const output = await model(texts[i], { pooling: 'mean', normalize: true });
        embeddings.push(Array.from(output.data));

        if ((i + 1) % 10 === 0 || i === total - 1) {
            logger.info(`${batchLabel} Embedded ${i + 1}/${total} chunks`);
        }
    }

    return embeddings;
}

/**
 * Get the embedding dimension.
 */
function getEmbeddingDimension() {
    return 384;
}

module.exports = { initEmbedder, embed, embedBatch, getEmbeddingDimension };
