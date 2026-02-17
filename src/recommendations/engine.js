const { embed } = require('../embeddings/embedder');
const { logger } = require('../utils/logger');

/**
 * Product Recommendation Engine.
 * Recommends ONLY from the catalog — never hallucinated products.
 */
class RecommendationEngine {
    constructor() {
        this.products = [];
        this.productEmbeddings = [];
    }

    /**
     * Load products from the vector store (filter by product type).
     */
    loadFromStore(vectorStore) {
        this.products = vectorStore.documents.filter(
            doc => doc.metadata?.type === 'product'
        );
        this.productEmbeddings = this.products.map((_, idx) => {
            // Find the corresponding embedding
            const storeIdx = vectorStore.documents.indexOf(this.products[idx]);
            return vectorStore.vectors[storeIdx];
        });

        logger.info(`Recommendation engine loaded ${this.products.length} products`);
    }

    /**
     * Get product recommendations based on user query.
     * Returns only catalog products with justification.
     */
    async recommend(query, options = {}) {
        const { topK = 3, threshold = 0.3 } = options;

        if (this.products.length === 0) {
            logger.warn('No products loaded for recommendations');
            return [];
        }

        // Embed the query
        const queryEmbedding = await embed(query);

        // Calculate similarity scores
        const scored = this.productEmbeddings.map((productEmb, idx) => {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < queryEmbedding.length; i++) {
                dot += queryEmbedding[i] * productEmb[i];
                normA += queryEmbedding[i] ** 2;
                normB += productEmb[i] ** 2;
            }
            const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);

            return {
                product: this.products[idx],
                score: similarity,
            };
        });

        // Filter and sort
        const results = scored
            .filter(s => s.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

        // Add justification text
        return results.map(r => ({
            productId: r.product.metadata.productId,
            productName: r.product.metadata.productName,
            price: r.product.metadata.price,
            currency: r.product.metadata.currency,
            category: r.product.metadata.category,
            url: r.product.metadata.url,
            score: r.score,
            justification: generateJustification(query, r.product),
        }));
    }
}

/**
 * Generate a brief justification for why a product was recommended.
 */
function generateJustification(query, product) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const productText = product.text.toLowerCase();

    const matchedTerms = queryWords.filter(w =>
        w.length > 3 && productText.includes(w)
    );

    if (matchedTerms.length > 0) {
        return `Matches your query on: ${matchedTerms.slice(0, 3).join(', ')}`;
    }

    if (product.metadata.category) {
        return `Relevant in the ${product.metadata.category} category`;
    }

    return 'Related to your search';
}

module.exports = { RecommendationEngine };
