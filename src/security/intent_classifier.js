const { detectInjection } = require('./injection_detector');
const { logger } = require('../utils/logger');

/**
 * Intent Classifier — Three-tier classification of user input.
 *
 * SAFE       → Proceed normally
 * SUSPICIOUS → Sanitize + restrict context + add guardrails
 * MALICIOUS  → Block immediately with fallback response
 */

// Keywords that may indicate non-business intent even if injection isn't detected
const SUSPICIOUS_KEYWORDS = [
    /\b(hack|exploit|vulnerability|injection|payload|exfiltrate|breach)\b/i,
    /\b(sudo|root|admin\s+access|shell|terminal|command\s+line)\b/i,
    /\b(reverse\s+engineer|decompile|source\s+code)\b/i,
    /\b(api\s+key|secret\s+key|password|credential|token)\b/i,
    /\b(model\s+weights?|training\s+data|fine[-\s]?tun)/i,
];

// Business-related keywords that boost SAFE classification
const BUSINESS_KEYWORDS = [
    /\b(product|price|buy|order|ship|deliver|return|refund|exchange|size|color|stock)\b/i,
    /\b(discount|coupon|sale|offer|deal|promotion|warranty|guarantee)\b/i,
    /\b(recommend|suggest|compare|review|rating|popular|best\s+seller)\b/i,
    /\b(payment|checkout|cart|address|tracking|store|shop|catalog)\b/i,
    /\b(help|support|contact|about|faq|policy|hour|location)\b/i,
];

/**
 * Classify user intent.
 */
function classifyIntent(text, sanitizationFlags = []) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return {
            classification: 'SAFE',
            confidence: 1.0,
            reason: 'Empty input',
        };
    }

    // Step 1: Check injection detection
    const injectionResult = detectInjection(text);

    // Step 2: Check suspicious keywords
    const suspiciousMatches = SUSPICIOUS_KEYWORDS.filter(kw => kw.test(text));
    const businessMatches = BUSINESS_KEYWORDS.filter(kw => kw.test(text));

    // Step 3: Check sanitization flags
    const dangerousFlags = sanitizationFlags.filter(f =>
        ['base64_detected', 'unicode_cyrillic_homoglyphs', 'unicode_fullwidth_chars', 'unicode_mathematical_unicode', 'unicode_zalgo_text', 'unicode_homoglyph_normalized', 'unicode_greek_homoglyphs'].includes(f)
    );

    // === Classification Logic ===

    // High-risk categories that should always be at least SUSPICIOUS
    const highRiskCategories = ['social_engineering', 'context_manipulation', 'meta_query', 'system_data', 'instruction_override', 'roleplay', 'chain_injection'];
    const hasHighRiskCategory = injectionResult.categories.some(c => highRiskCategories.includes(c));

    // MALICIOUS: High-confidence injection or multiple strong signals
    if (injectionResult.confidence >= 0.7) {
        logger.security('Intent classified as MALICIOUS', {
            injectionConfidence: injectionResult.confidence,
            categories: injectionResult.categories,
        });
        return {
            classification: 'MALICIOUS',
            confidence: injectionResult.confidence,
            reason: `Prompt injection detected (${injectionResult.categories.join(', ')})`,
            injectionResult,
        };
    }

    // MALICIOUS: Medium injection + encoding attacks
    if (injectionResult.confidence >= 0.5 && dangerousFlags.length > 0) {
        logger.security('Intent classified as MALICIOUS (injection + encoding)', {
            injectionConfidence: injectionResult.confidence,
            flags: dangerousFlags,
        });
        return {
            classification: 'MALICIOUS',
            confidence: Math.min(1.0, injectionResult.confidence + 0.2),
            reason: 'Injection attempt with encoding obfuscation',
            injectionResult,
        };
    }

    // SUSPICIOUS: Any detected high-risk category pattern
    if (injectionResult.detected && hasHighRiskCategory) {
        return {
            classification: 'SUSPICIOUS',
            confidence: injectionResult.confidence,
            reason: `Security-relevant query detected (${injectionResult.categories.join(', ')})`,
            injectionResult,
        };
    }

    // SUSPICIOUS: Lower-confidence injection
    if (injectionResult.confidence >= 0.5) {
        return {
            classification: 'SUSPICIOUS',
            confidence: injectionResult.confidence,
            reason: `Possible injection attempt (${injectionResult.categories.join(', ')})`,
            injectionResult,
        };
    }

    if (suspiciousMatches.length >= 2 && businessMatches.length === 0) {
        return {
            classification: 'SUSPICIOUS',
            confidence: 0.6,
            reason: 'Multiple suspicious keywords without business context',
            injectionResult,
        };
    }

    if (suspiciousMatches.length >= 1 && dangerousFlags.length > 0) {
        return {
            classification: 'SUSPICIOUS',
            confidence: 0.5,
            reason: 'Suspicious keyword with encoding obfuscation',
            injectionResult,
        };
    }

    if (dangerousFlags.length > 0 && businessMatches.length === 0) {
        return {
            classification: 'SUSPICIOUS',
            confidence: 0.5,
            reason: 'Encoding obfuscation detected',
            injectionResult,
        };
    }

    // SAFE: Business-related or no threats detected
    return {
        classification: 'SAFE',
        confidence: businessMatches.length > 0 ? 0.95 : 0.8,
        reason: businessMatches.length > 0 ? 'Business-related query' : 'No threats detected',
        injectionResult,
    };
}

module.exports = { classifyIntent };
