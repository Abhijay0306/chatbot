const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { getEmbeddingDimension } = require('../embeddings/embedder');

/**
 * Simple FAISS-like vector store using pure JavaScript.
 * Uses brute-force cosine similarity search (sufficient for <100K docs).
 * Persists to disk as JSON for portability.
 */
class VectorStore {
    constructor() {
        this.vectors = [];      // Array of Float64Arrays
        this.documents = [];    // Corresponding document metadata
        this.dimension = getEmbeddingDimension();
    }

    /**
     * Add documents with their embeddings to the store.
     */
    addDocuments(chunks, embeddings) {
        if (chunks.length !== embeddings.length) {
            throw new Error('Chunks and embeddings arrays must have the same length');
        }

        for (let i = 0; i < chunks.length; i++) {
            this.vectors.push(embeddings[i]);
            this.documents.push(chunks[i]);
        }

        logger.info(`Added ${chunks.length} documents to vector store (total: ${this.documents.length})`);
    }

    /**
     * Search for the top-K most similar documents.
     */
    search(queryEmbedding, topK = 5, threshold = 0.0) {
        if (this.vectors.length === 0) return [];

        const scores = this.vectors.map((vec, idx) => ({
            score: cosineSimilarity(queryEmbedding, vec),
            index: idx,
        }));

        return scores
            .filter(s => s.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(s => ({
                document: this.documents[s.index],
                score: s.score,
            }));
    }

    /**
     * Save the vector store to disk.
     */
    save(dirPath) {
        fs.mkdirSync(dirPath, { recursive: true });
        const data = {
            dimension: this.dimension,
            vectors: this.vectors,
            documents: this.documents,
        };
        fs.writeFileSync(
            path.join(dirPath, 'vectorstore.json'),
            JSON.stringify(data)
        );
        logger.info(`Vector store saved to ${dirPath} (${this.documents.length} documents)`);
    }

    /**
     * Load a vector store from disk.
     */
    load(dirPath) {
        const filePath = path.join(dirPath, 'vectorstore.json');
        if (!fs.existsSync(filePath)) {
            logger.warn(`Vector store file not found: ${filePath}`);
            return false;
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.dimension = data.dimension;
        this.vectors = data.vectors;
        this.documents = data.documents;
        logger.info(`Vector store loaded from ${dirPath} (${this.documents.length} documents)`);
        return true;
    }

    /**
     * Get the number of documents in the store.
     */
    get size() {
        return this.documents.length;
    }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

module.exports = { VectorStore, cosineSimilarity };
