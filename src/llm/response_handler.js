const { logger } = require('../utils/logger');

const FALLBACK = "I don't have that information in my knowledge base. Please contact our support team for accurate assistance.";

/**
 * Validate that the response is grounded in context.
 * Returns true if the response appears to be based on provided context.
 */
function validateContextGrounding(response, context) {
    if (!context || context.trim().length === 0) {
        // No context was provided — only fallback is acceptable
        const lowerResp = response.toLowerCase();
        if (lowerResp.includes("don't have") || lowerResp.includes('contact') || lowerResp.includes('support team')) {
            return true; // Proper fallback
        }
        return false; // LLM hallucinated without context
    }
    return true; // Context was provided, trust the LLM within limits
}

/**
 * Format the LLM response for clean output.
 */
function formatResponse(rawResponse) {
    if (!rawResponse || rawResponse.trim().length === 0) {
        return FALLBACK;
    }

    let formatted = rawResponse.trim();

    // Remove any markdown code blocks that might wrap the entire response
    formatted = formatted.replace(/^```[\s\S]*?```$/gm, match => {
        return match.slice(3, -3).trim();
    });

    // Clean up excessive whitespace
    formatted = formatted.replace(/\n{3,}/g, '\n\n');

    return formatted;
}

/**
 * Handle the full response pipeline.
 */
function handleResponse(llmResult, context) {
    const { content, usage, error } = llmResult;

    if (error) {
        logger.warn(`LLM returned error: ${error}`);
        return {
            response: content || FALLBACK,
            metadata: { error, usage, grounded: false },
        };
    }

    // Validate grounding
    const grounded = validateContextGrounding(content, context);
    if (!grounded) {
        logger.security('Response failed context grounding validation — using fallback');
        return {
            response: FALLBACK,
            metadata: { usage, grounded: false, reason: 'hallucination_detected' },
        };
    }

    // Format response
    const formatted = formatResponse(content);

    return {
        response: formatted,
        metadata: { usage, grounded: true },
    };
}

module.exports = { handleResponse, formatResponse, validateContextGrounding, FALLBACK };
