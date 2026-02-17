const { logger } = require('../utils/logger');

/**
 * Split text into overlapping chunks for embedding.
 * Uses recursive character splitting with metadata preservation.
 */
function chunkText(text, options = {}) {
    const {
        chunkSize = 512,
        chunkOverlap = 50,
        separators = ['\n\n', '\n', '. ', ' ', ''],
    } = options;

    if (!text || text.trim().length === 0) return [];

    const chunks = [];
    _recursiveSplit(text, separators, chunkSize, chunkOverlap, chunks);
    return chunks;
}

function _recursiveSplit(text, separators, chunkSize, chunkOverlap, result) {
    if (text.length <= chunkSize) {
        if (text.trim().length > 0) {
            result.push(text.trim());
        }
        return;
    }

    const separator = separators[0];
    const remainingSeparators = separators.slice(1);

    if (!separator && separator !== '') {
        // No more separators, force-split by chunkSize
        for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
            const chunk = text.slice(i, i + chunkSize).trim();
            if (chunk.length > 0) result.push(chunk);
        }
        return;
    }

    const parts = separator === '' ? text.split('') : text.split(separator);
    let currentChunk = '';

    for (const part of parts) {
        const candidate = currentChunk
            ? currentChunk + separator + part
            : part;

        if (candidate.length <= chunkSize) {
            currentChunk = candidate;
        } else {
            if (currentChunk.trim().length > 0) {
                result.push(currentChunk.trim());
            }

            // If part itself is too large, split recursively with next separator
            if (part.length > chunkSize && remainingSeparators.length > 0) {
                _recursiveSplit(part, remainingSeparators, chunkSize, chunkOverlap, result);
                currentChunk = '';
            } else {
                // Apply overlap by keeping the end of the previous chunk
                if (chunkOverlap > 0 && currentChunk.length > 0) {
                    const overlap = currentChunk.slice(-chunkOverlap);
                    currentChunk = overlap + separator + part;
                } else {
                    currentChunk = part;
                }
            }
        }
    }

    if (currentChunk.trim().length > 0) {
        result.push(currentChunk.trim());
    }
}

/**
 * Create document chunks with metadata.
 */
function createChunks(content, metadata, options = {}) {
    const textChunks = chunkText(content, options);
    logger.info(`Created ${textChunks.length} chunks from ${metadata.source}`);

    return textChunks.map((text, index) => ({
        id: `${metadata.source}_chunk_${index}`,
        text,
        metadata: {
            ...metadata,
            chunkIndex: index,
            totalChunks: textChunks.length,
        },
    }));
}

module.exports = { chunkText, createChunks };
