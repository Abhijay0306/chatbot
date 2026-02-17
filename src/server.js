const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { config, validateConfig } = require('./config');
const { logger } = require('./utils/logger');
const { createSecurityMiddleware } = require('./security/middleware');
const { VectorStore } = require('./vectorstore/faiss_store');
const { initSearch, hybridSearch, buildContext, buildSourceReferences } = require('./retrieval/hybrid_search');
const { generateResponse, generateResponseStream } = require('./llm/grok_client');
const { handleResponse } = require('./llm/response_handler');
const { RecommendationEngine } = require('./recommendations/engine');
const { QueryCache } = require('./cache/query_cache');
const { runPipeline } = require('./ingestion/pipeline');

const app = express();
const isVercel = !!process.env.VERCEL;

// === Security Headers ===
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"],
        },
    },
}));

// === CORS ===
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
            return callback(null, true);
        }
        // Auto-allow hosted platform origins
        try {
            const originHost = new URL(origin).hostname;
            const selfHosts = ['localhost', '127.0.0.1'];
            if (
                selfHosts.includes(originHost) ||
                originHost.endsWith('.railway.app') ||
                originHost.endsWith('.up.railway.app') ||
                originHost.endsWith('.vercel.app')
            ) {
                return callback(null, true);
            }
        } catch (e) { /* invalid origin URL, fall through to reject */ }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));

// === Rate Limiting ===
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMax,
    message: { error: 'Too many requests. Please try again shortly.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// === Body Parsing ===
app.use(express.json({ limit: '10kb' }));

// Static files: Serve public/ in all environments (including Vercel)
app.use(express.static(path.join(__dirname, '..', 'public')));

// === Serve Documents (for source reference links) ===
app.use('/documents', express.static(config.paths.documentsDir, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.pdf')) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
        }
    },
}));

// === Initialize Components ===
const vectorStore = new VectorStore();
const recommendationEngine = new RecommendationEngine();
const queryCache = new QueryCache();
const { security, preProcessMiddleware } = createSecurityMiddleware();

let isReady = false;
let initPromise = null;

async function initializeSystem() {
    if (isReady) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        validateConfig();

        const loaded = vectorStore.load(config.paths.indexDir);
        if (!loaded) {
            logger.info('No existing index found. Running ingestion pipeline...');
            const store = await runPipeline();
            if (store) {
                Object.assign(vectorStore, store);
            }
        }

        if (vectorStore.size > 0) {
            await initSearch(vectorStore);
            recommendationEngine.loadFromStore(vectorStore);
        } else {
            logger.warn('Vector store is empty. Chat will return fallbacks until documents are ingested.');
        }

        isReady = true;
        logger.info(`System initialized with ${vectorStore.size} documents`);
    })();

    return initPromise;
}

// === Readiness Middleware ===
// On Vercel, lazily initialize on first request (handles cold starts)
// Locally, initialization happens at server startup before listen()
async function ensureReady(req, res, next) {
    if (!isReady) {
        try {
            await initializeSystem();
        } catch (err) {
            logger.error(`Initialization failed: ${err.message}`);
            return res.status(503).json({ error: 'Service initializing. Please try again in a moment.' });
        }
    }
    next();
}

app.use('/api/chat', ensureReady);
app.use('/api/chat/stream', ensureReady);

// === Technical Query Detection ===
// Only show source document references for technical questions
const TECHNICAL_PATTERNS = [
    /\b(install|wire|wiring|connect|setup|mount|configure|calibrat|adjust|troubleshoot|repair|replace|maintain)/i,
    /\b(spec|specification|dimension|rating|voltage|current|amp|watt|power|torque|speed|frequency|phase)/i,
    /\b(pmp|tp-?2|cr-?150|pfr|upc|ph-?3|ph-?1000|load\s*control|power\s*sensor|power\s*cell)/i,
    /\b(overload|underload|protection|sensor|relay|alarm|trip|fault|error|fail)/i,
    /\b(manual|datasheet|diagram|schematic|drawing|part\s*number|model)/i,
    /\b(motor|pump|compressor|conveyor|fan|blower|machine|application)/i,
    /\b(modbus|communication|signal|output|input|analog|digital|setpoint)/i,
    /\b(how\s+(to|do|does|can|should)|what\s+(is|are|does)|which|where)/i,
];

function isTechnicalQuery(query) {
    return TECHNICAL_PATTERNS.some(pattern => pattern.test(query));
}

// === Health Check ===
app.get('/api/health', async (req, res) => {
    // Trigger lazy init if needed (so health checks work on Vercel)
    if (!isReady) {
        try { await initializeSystem(); } catch (e) { /* swallow */ }
    }
    res.json({
        status: isReady ? 'healthy' : 'initializing',
        documents: vectorStore.size,
        cache: queryCache.getStats(),
        security: security.getStats(),
        uptime: process.uptime(),
    });
});

// === Main Chat Endpoint (non-streaming, backward compatible) ===
app.post('/api/chat', preProcessMiddleware, async (req, res) => {
    try {
        const { securityResult } = req;
        const query = securityResult.sanitizedInput;
        const classification = securityResult.classification;

        // Check cache
        const cached = queryCache.get(query);
        if (cached) {
            return res.json({
                response: cached.response,
                sources: cached.sources || [],
                cached: true,
            });
        }

        // Retrieve context
        const restrictions = securityResult.restrictions || {};
        const topK = restrictions.maxContextChunks || config.rag.topK;
        const searchResults = await hybridSearch(query, { topK });
        const context = buildContext(searchResults);
        const sources = isTechnicalQuery(query) ? buildSourceReferences(searchResults) : [];

        // Generate LLM response
        const llmOptions = {};
        if (restrictions.extraSystemPrompt) {
            llmOptions.extraSystemPrompt = restrictions.extraSystemPrompt;
        }

        const llmResult = await generateResponse(query, context, llmOptions);
        const { response: formattedResponse, metadata } = handleResponse(llmResult, context);

        // Post-LLM security filter
        const { response: finalResponse, filtered } = security.postProcess(
            formattedResponse,
            classification
        );

        // Cache (only SAFE)
        if (classification === 'SAFE' && !filtered) {
            queryCache.set(query, { response: finalResponse, sources });
        }

        res.json({
            response: finalResponse,
            sources,
            metadata: {
                classification,
                cached: false,
                tokensUsed: metadata?.usage?.totalTokens || 0,
            },
        });
    } catch (error) {
        logger.error(`Chat error: ${error.message}`, { stack: error.stack });
        res.status(500).json({
            response: "I'm experiencing a temporary issue. Please try again shortly.",
            error: config.nodeEnv === 'development' ? error.message : undefined,
        });
    }
});

// === Streaming Chat Endpoint (SSE) ===
app.post('/api/chat/stream', preProcessMiddleware, async (req, res) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if proxied
    res.flushHeaders();

    try {
        const { securityResult } = req;
        const query = securityResult.sanitizedInput;
        const classification = securityResult.classification;

        // Check cache — if cached, send it all at once and close
        const cached = queryCache.get(query);
        if (cached) {
            res.write(`data: ${JSON.stringify({ chunk: cached.response, sources: cached.sources || [], done: true, cached: true })}\n\n`);
            return res.end();
        }

        // Retrieve context
        const restrictions = securityResult.restrictions || {};
        const topK = restrictions.maxContextChunks || config.rag.topK;
        const searchResults = await hybridSearch(query, { topK });
        const context = buildContext(searchResults);
        const sources = isTechnicalQuery(query) ? buildSourceReferences(searchResults) : [];

        // LLM options
        const llmOptions = {};
        if (restrictions.extraSystemPrompt) {
            llmOptions.extraSystemPrompt = restrictions.extraSystemPrompt;
        }

        // Stream the response
        const stream = await generateResponseStream(query, context, llmOptions);
        let fullResponse = '';

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ chunk: delta, done: false })}\n\n`);
            }
        }

        // Post-LLM security filter on the full response
        const { response: finalResponse, filtered } = security.postProcess(
            fullResponse,
            classification
        );

        // If the output filter changed the response, send the replacement
        if (filtered) {
            res.write(`data: ${JSON.stringify({ chunk: '', replace: finalResponse, done: true, sources, filtered: true })}\n\n`);
        } else {
            // Send final event with sources
            res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);

            // Cache the response
            if (classification === 'SAFE') {
                queryCache.set(query, { response: fullResponse, sources });
            }
        }

        logger.info(`Streamed response for "${query.substring(0, 50)}..." (${fullResponse.length} chars)`);
    } catch (error) {
        logger.error(`Stream error: ${error.message}`, { stack: error.stack });
        res.write(`data: ${JSON.stringify({ chunk: "I'm experiencing a temporary issue. Please try again shortly.", done: true, error: true })}\n\n`);
    }

    res.end();
});

// === Admin: Trigger Re-Ingestion ===
app.post('/api/ingest', async (req, res) => {
    try {
        logger.info('Re-ingestion triggered');
        const store = await runPipeline();
        if (store) {
            Object.assign(vectorStore, store);
            await initSearch(vectorStore);
            recommendationEngine.loadFromStore(vectorStore);
            queryCache.clear();
        }
        res.json({ success: true, documents: vectorStore.size });
    } catch (error) {
        logger.error(`Ingestion error: ${error.message}`);
        res.status(500).json({ error: 'Ingestion failed' });
    }
});

// === Serve Chat Widget Demo Page (all environments) ===
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// === Start Server (local dev only — Vercel imports the app directly) ===
if (!isVercel) {
    initializeSystem()
        .then(() => {
            app.listen(config.port, () => {
                logger.info(`🚀 Load Controls Chatbot running on http://localhost:${config.port}`);
                logger.info(`📊 Health check: http://localhost:${config.port}/api/health`);
            });
        })
        .catch(err => {
            logger.error(`Failed to initialize: ${err.message}`);
            process.exit(1);
        });
}

module.exports = app;
