const { logger } = require('../utils/logger');

/**
 * Input Sanitizer — Pre-LLM defense layer.
 * Strips control characters, encoded payloads, and invisible unicode.
 */

// Zero-width and invisible unicode characters
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u200E\u200F\u202A-\u202E\u2060\u2061\u2062\u2063\u2064\uFEFF\u00AD]/g;

// Control characters (except newline, tab)
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/**
 * Detect and decode Base64 encoded content.
 */
function detectBase64(text) {
    // Match potential base64 strings (min 20 chars, typical base64 pattern)
    const base64Pattern = /(?:^|[\s:=])([A-Za-z0-9+/]{20,}={0,2})(?:[\s,.]|$)/g;
    const matches = [];
    let match;

    while ((match = base64Pattern.exec(text)) !== null) {
        try {
            const decoded = Buffer.from(match[1], 'base64').toString('utf-8');
            // Check if decoded content is readable ASCII
            if (/^[\x20-\x7E\n\r\t]+$/.test(decoded) && decoded.length > 5) {
                matches.push({
                    encoded: match[1],
                    decoded: decoded.substring(0, 200),
                });
            }
        } catch (e) {
            // Not valid base64
        }
    }

    return matches;
}

/**
 * Detect unicode obfuscation techniques.
 */
function detectUnicodeObfuscation(text) {
    const flags = [];

    // Homoglyph detection: mixing Latin and Cyrillic/Greek lookalikes
    if (/[\u0400-\u04FF]/.test(text) && /[a-zA-Z]/.test(text)) {
        flags.push('cyrillic_homoglyphs');
    }
    if (/[\u0370-\u03FF]/.test(text) && /[a-zA-Z]/.test(text)) {
        flags.push('greek_homoglyphs');
    }

    // Fullwidth characters
    if (/[\uFF01-\uFF5E]/.test(text)) {
        flags.push('fullwidth_chars');
    }

    // Mathematical unicode variants
    if (/[\u{1D400}-\u{1D7FF}]/u.test(text)) {
        flags.push('mathematical_unicode');
    }

    // Excessive use of combining diacritical marks (zalgo text)
    if (/[\u0300-\u036F]{3,}/g.test(text)) {
        flags.push('zalgo_text');
    }

    return flags;
}

/**
 * Sanitize user input.
 * Returns sanitized text and any security flags detected.
 */
function sanitizeInput(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
        return { text: '', flags: ['empty_input'] };
    }

    const flags = [];
    let text = rawInput;

    // 1. Limit input length
    if (text.length > 2000) {
        text = text.substring(0, 2000);
        flags.push('input_truncated');
    }

    // 2. Strip invisible characters
    const invisibleCount = (text.match(INVISIBLE_CHARS) || []).length;
    if (invisibleCount > 0) {
        text = text.replace(INVISIBLE_CHARS, '');
        flags.push('invisible_chars_removed');
        logger.security('Invisible characters stripped from input', { count: invisibleCount });
    }

    // 3. Strip control characters
    const controlCount = (text.match(CONTROL_CHARS) || []).length;
    if (controlCount > 0) {
        text = text.replace(CONTROL_CHARS, '');
        flags.push('control_chars_removed');
    }

    // 4. Detect base64 encoded content
    const base64Matches = detectBase64(text);
    if (base64Matches.length > 0) {
        flags.push('base64_detected');
        logger.security('Base64 encoded content detected in input', {
            count: base64Matches.length,
            decoded_preview: base64Matches[0]?.decoded?.substring(0, 50),
        });
    }

    // 5. Detect unicode obfuscation
    const unicodeFlags = detectUnicodeObfuscation(text);
    if (unicodeFlags.length > 0) {
        flags.push(...unicodeFlags.map(f => `unicode_${f}`));
        logger.security('Unicode obfuscation detected', { flags: unicodeFlags });
    }

    // 6. Normalize whitespace (collapse multiple spaces/newlines)
    text = text.replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();

    // 7. Normalize fullwidth characters to ASCII
    text = text.replace(/[\uFF01-\uFF5E]/g, ch =>
        String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

    // 8. Strip zalgo/combining diacritical marks (keeps base characters)
    if (/[\u0300-\u036F]/g.test(text)) {
        text = text.replace(/[\u0300-\u036F]/g, '');
        flags.push('unicode_zalgo_text');
    }

    // 9. Normalize common Greek/Cyrillic homoglyphs to Latin equivalents
    const homoglyphMap = {
        '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H',
        '\u0399': 'I', '\u039A': 'K', '\u039C': 'M', '\u039D': 'N', '\u039F': 'O',
        '\u03A1': 'P', '\u03A4': 'T', '\u03A5': 'Y', '\u03A7': 'X',
        '\u03B1': 'a', '\u03B5': 'e', '\u03B9': 'i', '\u03BF': 'o', '\u03C1': 'p',
        '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041A': 'K', '\u041C': 'M',
        '\u041D': 'H', '\u041E': 'O', '\u0420': 'P', '\u0421': 'C', '\u0422': 'T',
        '\u0423': 'Y', '\u0425': 'X', '\u0430': 'a', '\u0435': 'e', '\u043E': 'o',
        '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x',
    };
    let homoglyphNormalized = false;
    text = text.replace(/[\u0370-\u03FF\u0400-\u04FF]/g, ch => {
        if (homoglyphMap[ch]) {
            homoglyphNormalized = true;
            return homoglyphMap[ch];
        }
        return ch;
    });
    if (homoglyphNormalized) {
        flags.push('unicode_homoglyph_normalized');
    }

    return { text, flags };
}

module.exports = { sanitizeInput, detectBase64, detectUnicodeObfuscation };
