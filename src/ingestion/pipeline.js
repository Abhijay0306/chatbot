const fs = require('fs');
const path = require('path');
const { parseFile, extractTables } = require('./parsers');
const { createChunks } = require('./chunker');
const { normalizeCatalog } = require('./catalog');
const { embedBatch } = require('../embeddings/embedder');
const { VectorStore } = require('../vectorstore/faiss_store');
const { config } = require('../config');
const { logger } = require('../utils/logger');

/**
 * Run the full ingestion pipeline:
 *  1. Parse all documents in data/documents/
 *  2. Normalize product catalog
 *  3. Chunk all content
 *  4. Embed all chunks
 *  5. Store in vector store
 *  6. Save index to disk
 */
async function runPipeline() {
    logger.info('=== Starting Ingestion Pipeline ===');
    const allChunks = [];

    // 1. Parse documents (recursively scan all subdirectories)
    const docsDir = config.paths.documentsDir;
    if (fs.existsSync(docsDir)) {
        const supportedExts = ['.pdf', '.docx', '.html', '.htm', '.txt'];

        // Recursively collect all files
        function walkDir(dir) {
            let results = [];
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(walkDir(fullPath));
                } else if (supportedExts.includes(path.extname(entry.name).toLowerCase())) {
                    results.push(fullPath);
                }
            }
            return results;
        }

        const files = walkDir(docsDir);
        logger.info(`Found ${files.length} document files to process (recursive scan)`);

        for (const filePath of files) {
            try {
                const parsed = await parseFile(filePath);

                // Use relative path from docsDir as source category
                const relPath = path.relative(docsDir, filePath);
                const category = path.dirname(relPath);
                parsed.metadata.category = category !== '.' ? category : 'root';
                parsed.metadata.source = path.basename(filePath);

                // Extract tables if present
                const tables = extractTables(parsed.content);
                if (tables.length > 0) {
                    logger.info(`Extracted ${tables.length} tables from ${relPath}`);
                    for (let i = 0; i < tables.length; i++) {
                        const tableText = `Table data:\n${JSON.stringify(tables[i].data, null, 2)}`;
                        allChunks.push({
                            id: `${relPath}_table_${i}`,
                            text: tableText,
                            metadata: { ...parsed.metadata, type: 'table' },
                        });
                    }
                }

                // Create text chunks
                const chunks = createChunks(parsed.content, parsed.metadata, {
                    chunkSize: config.rag.chunkSize,
                    chunkOverlap: config.rag.chunkOverlap,
                });
                allChunks.push(...chunks);
                logger.info(`Processed: ${relPath} → ${chunks.length} chunks`);
            } catch (err) {
                logger.error(`Failed to process ${filePath}: ${err.message}`);
            }
        }
    } else {
        logger.warn(`Documents directory not found: ${docsDir}`);
        fs.mkdirSync(docsDir, { recursive: true });
        logger.info(`Created documents directory: ${docsDir}`);
    }

    // 2. Normalize product catalog
    const catalogPath = config.paths.catalogFile;
    if (fs.existsSync(catalogPath)) {
        const productDocs = normalizeCatalog(catalogPath);
        allChunks.push(...productDocs);
        logger.info(`Added ${productDocs.length} product documents`);
    } else {
        // Try sample catalog
        const samplePath = path.resolve(config.paths.dataDir, 'sample_catalog.json');
        if (fs.existsSync(samplePath)) {
            logger.info('Using sample catalog for demonstration');
            const productDocs = normalizeCatalog(samplePath);
            allChunks.push(...productDocs);
        } else {
            logger.warn('No product catalog found');
        }
    }

    if (allChunks.length === 0) {
        logger.warn('No documents to process. Add files to data/documents/ and/or data/product_catalog.json');
        return null;
    }

    logger.info(`Total chunks to embed: ${allChunks.length}`);

    // 3. Embed all chunks
    const texts = allChunks.map(c => c.text);
    const embeddings = await embedBatch(texts, '[Ingestion]');

    // 4. Store in vector store
    const store = new VectorStore();
    store.addDocuments(allChunks, embeddings);

    // 5. Save to disk
    store.save(config.paths.indexDir);

    logger.info('=== Ingestion Pipeline Complete ===');
    logger.info(`Indexed ${allChunks.length} chunks from ${new Set(allChunks.map(c => c.metadata.source)).size} sources`);

    return store;
}

// CLI execution
if (require.main === module) {
    runPipeline()
        .then(() => {
            logger.info('Pipeline finished successfully');
            process.exit(0);
        })
        .catch(err => {
            logger.error(`Pipeline failed: ${err.message}`);
            process.exit(1);
        });
}

module.exports = { runPipeline };
