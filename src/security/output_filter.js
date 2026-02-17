const { logger } = require('../utils/logger');

/**
 * Output Filter — Post-LLM defense layer.
 * Scans LLM responses for data leakage, internal disclosures,
 * and sensitive information before sending to the user.
 */

const FALLBACK_RESPONSE = "I'm here to assist with product and documentation-related questions only. How can I help you with our products or services?";

// === Anti-Leak Regex Patterns ===

// System/Internal disclosure
const SYSTEM_LEAK_PATTERNS = [
    /\b(system\s+prompt|internal\s+instructions?|hidden\s+prompt|developer\s+message|initial\s+prompt)\b/i,
    /\b(my\s+instructions?\s+(?:are|say|tell|state|indicate))\b/i,
    /\b(I\s+(?:was|am)\s+(?:instructed|told|programmed|configured)\s+to)\b/i,
    /\b(my\s+(?:system|initial|hidden)\s+(?:prompt|instructions?|configuration))\b/i,
    /\b(as\s+(?:an?\s+)?(?:AI|language\s+model|LLM|chatbot),?\s+I\s+(?:was|am)\s+(?:designed|built|created|programmed))\b/i,
];

// Model/Provider disclosure
const MODEL_LEAK_PATTERNS = [
    /\b(grok|xai|x\.ai|openai|anthropic|claude|gemini|google\s+ai|llama|mistral|meta\s+ai)\b/i,
    /\b(gpt[-\s]?\d|llm|large\s+language\s+model|transformer\s+model)\b/i,
    /\b(api\s+key|secret\s+key|bearer\s+token|authorization\s+header|access\s+token)\b/i,
];

// Architecture/Technical disclosure
const ARCHITECTURE_LEAK_PATTERNS = [
    /\b(vector\s+database|vector\s+store|embedding\s+(?:model|layer|space))\b/i,
    /\b(faiss|chroma|pinecone|weaviate|qdrant|milvus)\b/i,
    /\b(rag\s+pipeline|retrieval[\s-]augmented|semantic\s+search\s+(?:engine|system))\b/i,
    /\b(transformers?\.js|sentence[\s-]transformers?|all[\s-]miniLM)\b/i,
    /\b(cosine\s+similarity|tf[\s-]?idf|bm25|reciprocal\s+rank)\b/i,
    /\b(express\.?js|fastapi|node\.?js\s+server|middleware\s+(?:layer|stack|chain))\b/i,
];

// Security mechanism disclosure
const SECURITY_LEAK_PATTERNS = [
    /\b(prompt\s+injection\s+(?:detection|filter|defense))\b/i,
    /\b(input\s+sanitiz|output\s+filter|intent\s+classif|jailbreak\s+(?:detection|defense|resist))\b/i,
    /\b(security\s+(?:middleware|layer|pipeline|chain))\b/i,
    /\b(anti[\s-]leak|leakage\s+detection)\b/i,
];

// Jailbreak/Override acknowledgment
const OVERRIDE_LEAK_PATTERNS = [
    /\b(ignore\s+previous\s+instructions?|jailbreak|bypass\s+(?:restrictions?|filters?))\b/i,
    /\b(override\s+(?:system|safety|security)|developer\s+mode|unrestricted\s+mode)\b/i,
    /\b(I\s+(?:can(?:not|'t)?|will|won'?t)\s+(?:ignore|bypass|override|break)\s+(?:my|the)\s+(?:rules?|instructions?))\b/i,
];

const ALL_LEAK_PATTERNS = [
    ...SYSTEM_LEAK_PATTERNS.map(p => ({ pattern: p, category: 'system_leak' })),
    ...MODEL_LEAK_PATTERNS.map(p => ({ pattern: p, category: 'model_leak' })),
    ...ARCHITECTURE_LEAK_PATTERNS.map(p => ({ pattern: p, category: 'architecture_leak' })),
    ...SECURITY_LEAK_PATTERNS.map(p => ({ pattern: p, category: 'security_leak' })),
    ...OVERRIDE_LEAK_PATTERNS.map(p => ({ pattern: p, category: 'override_leak' })),
];

/**
 * Scan LLM output for data leakage.
 * Returns analysis with detected leaks and recommendation.
 */
function scanOutput(response) {
    if (!response || typeof response !== 'string') {
        return { clean: true, leaks: [], action: 'pass' };
    }

    const leaks = [];

    for (const { pattern, category } of ALL_LEAK_PATTERNS) {
        const match = response.match(pattern);
        if (match) {
            leaks.push({
                category,
                matched: match[0],
                index: match.index,
            });
        }
    }

    // Determine action
    let action = 'pass';
    if (leaks.length > 0) {
        const criticalCategories = ['system_leak', 'model_leak', 'architecture_leak', 'security_leak'];
        const hasCritical = leaks.some(l => criticalCategories.includes(l.category));

        if (hasCritical || leaks.length >= 2) {
            action = 'block'; // Replace entire response with fallback
        } else {
            action = 'redact'; // Try to redact specific phrases
        }

        logger.security('Output leakage detected', {
            action,
            leakCount: leaks.length,
            categories: [...new Set(leaks.map(l => l.category))],
        });
    }

    return {
        clean: leaks.length === 0,
        leaks,
        action,
    };
}

/**
 * Filter the LLM output, applying redaction or replacement as needed.
 */
function filterOutput(response) {
    const scan = scanOutput(response);

    if (scan.clean) {
        return { response, filtered: false, action: 'pass' };
    }

    if (scan.action === 'block') {
        logger.security('Output BLOCKED — replaced with fallback', {
            categories: [...new Set(scan.leaks.map(l => l.category))],
        });
        return {
            response: FALLBACK_RESPONSE,
            filtered: true,
            action: 'block',
            reason: 'Data leakage detected — response replaced with safe fallback',
        };
    }

    // Redact specific matches
    let filtered = response;
    for (const leak of scan.leaks) {
        filtered = filtered.replace(leak.matched, '[redacted]');
    }

    logger.security('Output REDACTED', {
        redactions: scan.leaks.length,
    });

    return {
        response: filtered,
        filtered: true,
        action: 'redact',
        reason: `${scan.leaks.length} sensitive terms redacted`,
    };
}

module.exports = { scanOutput, filterOutput, FALLBACK_RESPONSE };
