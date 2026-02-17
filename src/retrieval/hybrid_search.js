const natural = require('natural');
const { embed } = require('../embeddings/embedder');
const { VectorStore } = require('../vectorstore/faiss_store');
const { config } = require('../config');
const { logger } = require('../utils/logger');

const TfIdf = natural.TfIdf;

let vectorStore = null;
let tfidf = null;
let allDocuments = [];

/**
 * Initialize the hybrid search system.
 */
async function initSearch(store) {
    vectorStore = store;
    allDocuments = store.documents;

    // Build BM25 / TF-IDF index for keyword search
    tfidf = new TfIdf();
    for (const doc of allDocuments) {
        tfidf.addDocument(doc.text);
    }

    logger.info(`Hybrid search initialized with ${allDocuments.length} documents`);
}

/**
 * Perform hybrid search: vector similarity + keyword (TF-IDF) with RRF fusion.
 */
async function hybridSearch(query, options = {}) {
    const {
        topK = config.rag.topK,
        threshold = config.rag.relevanceThreshold,
        vectorWeight = 0.7,
        keywordWeight = 0.3,
    } = options;

    if (!vectorStore || vectorStore.size === 0) {
        logger.warn('Vector store is empty, cannot search');
        return [];
    }

    // 1. Vector search
    const queryEmbedding = await embed(query);
    const vectorResults = vectorStore.search(queryEmbedding, topK * 2, 0);

    // 2. Keyword search (TF-IDF)
    const keywordScores = [];
    if (tfidf) {
        tfidf.tfidfs(query, (docIndex, score) => {
            keywordScores.push({ index: docIndex, score });
        });
    }

    // Sort keyword results by score descending
    keywordScores.sort((a, b) => b.score - a.score);
    const keywordTopK = keywordScores.slice(0, topK * 2);

    // 3. Reciprocal Rank Fusion (RRF)
    const K = 60; // RRF constant
    const fusedScores = new Map();

    vectorResults.forEach((result, rank) => {
        const docId = result.document.id;
        const rrfScore = vectorWeight / (K + rank + 1);
        fusedScores.set(docId, (fusedScores.get(docId) || 0) + rrfScore);
    });

    keywordTopK.forEach((result, rank) => {
        const doc = allDocuments[result.index];
        if (doc) {
            const docId = doc.id;
            const rrfScore = keywordWeight / (K + rank + 1);
            fusedScores.set(docId, (fusedScores.get(docId) || 0) + rrfScore);
        }
    });

    // 4. Build result set with scores
    const docMap = new Map();
    for (const result of vectorResults) {
        docMap.set(result.document.id, { document: result.document, vectorScore: result.score });
    }
    for (const ks of keywordTopK) {
        const doc = allDocuments[ks.index];
        if (doc && !docMap.has(doc.id)) {
            docMap.set(doc.id, { document: doc, vectorScore: 0 });
        }
    }

    // 5. Sort by fused score and apply threshold
    const results = Array.from(fusedScores.entries())
        .map(([docId, fusedScore]) => {
            const entry = docMap.get(docId);
            if (!entry) return null;
            return {
                document: entry.document,
                score: fusedScore,
                vectorScore: entry.vectorScore,
            };
        })
        .filter(r => r !== null)
        .filter(r => r.vectorScore >= threshold || r.score > 0.005) // Relevance filter
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    logger.info(`Hybrid search for "${query.substring(0, 50)}..." returned ${results.length} results`);
    return results;
}

/**
 * Build context string from search results for LLM.
 * Includes source document name and category for citation.
 */
function buildContext(results) {
    if (results.length === 0) return '';

    return results
        .map((r, i) => {
            const source = r.document.metadata?.source || 'unknown';
            const category = r.document.metadata?.category || '';
            const type = r.document.metadata?.type || 'text';
            const label = category ? `${category} / ${source}` : source;
            return `[Source ${i + 1}: ${label} (${type})]\n${r.document.text}`;
        })
        .join('\n\n---\n\n');
}

/**
 * Build structured source references for display in the widget.
 */
function buildSourceReferences(results) {
    const seen = new Set();
    const sources = [];

    for (const r of results) {
        const source = r.document.metadata?.source || 'unknown';
        if (seen.has(source)) continue;
        seen.add(source);

        const category = r.document.metadata?.category || '';
        // Build a URL-safe path to the document
        const docPath = category ? `${category}/${source}` : source;
        // Use GitHub raw content URL as requested
        const githubUrl = `https://github.com/Abhijay0306/chatbot/raw/main/data/Documents/${docPath}`;

        sources.push({
            filename: source,
            category: category || 'General',
            section: r.document.text?.substring(0, 120)?.replace(/\n/g, ' ').trim() + '...',
            url: githubUrl, // Updated to GitHub URL
            score: r.score?.toFixed(3),
        });
    }

    return sources.slice(0, 4); // Max 4 source references
}

module.exports = { initSearch, hybridSearch, buildContext, buildSourceReferences };
