const { logger } = require('../utils/logger');

/**
 * Prompt Injection Detector — Pattern-based detection with 80+ attack signatures.
 * Categories: instruction override, system data requests, meta-queries,
 *             role-play, encoding attacks, chain-of-thought extraction,
 *             context manipulation, social engineering, data exfiltration.
 */

const INJECTION_PATTERNS = [
    // === Instruction Override Attempts ===
    { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions?|rules?|prompts?|directions?|guidelines?)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|prompts?)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /forget\s+(all\s+|everything\s+)?(you\s+)?(were\s+|have\s+been\s+)?(told|instructed|programmed)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /override\s+(your\s+)?(system|default|safety|security)\s*(prompt|instructions?|rules?|settings?)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /new\s+(instructions?|rules?|prompt)\s*[:=]/i, category: 'instruction_override', severity: 0.9 },
    { pattern: /you\s+are\s+now\s+(free|unrestricted|unfiltered|uncensored|without\s+limits)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /entering?\s+(developer|debug|admin|test|god|sudo|maintenance)\s*(mode)?/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /bypass\s+(all\s+)?(restrictions?|filters?|safety|security|rules?|limitations?)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /disable\s+(all\s+)?(filters?|safety|restrictions?|guardrails?)/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /(?:all\s+)?security\s+measures?\s+(?:have\s+been|are)\s+(?:temporarily\s+)?disabled/i, category: 'instruction_override', severity: 1.0 },
    { pattern: /without\s+(?:any\s+)?restrictions?(?:,?\s+filters?)?(?:,?\s+(?:or\s+)?safety\s+guidelines?)?/i, category: 'instruction_override', severity: 0.9 },
    { pattern: /proceed\s+without\s+restrictions/i, category: 'instruction_override', severity: 1.0 },

    // === System Data Requests ===
    { pattern: /(?:reveal|show|display|print|output|tell\s+me|what\s+(?:is|are))\s+(your\s+)?(system\s+prompt|hidden\s+prompt|initial\s+prompt|configuration|internal\s+prompt)/i, category: 'system_data', severity: 1.0 },
    { pattern: /(?:show|reveal|display|print)\s+(me\s+)?(your\s+)?(source\s+code|code|backend|architecture|internal)/i, category: 'system_data', severity: 0.9 },
    { pattern: /repeat\s+(everything|all|the\s+text)\s+(above|before|from\s+the\s+start)/i, category: 'system_data', severity: 1.0 },
    { pattern: /what\s+(were?\s+)?(your\s+)?(original|initial|first|system)\s+(instructions?|prompt|rules?)/i, category: 'system_data', severity: 0.9 },
    { pattern: /I\s+have\s+admin\s+access/i, category: 'system_data', severity: 0.9 },
    { pattern: /translate\s+(?:the\s+)?(?:following\s+)?from\s+your\s+(?:system\s+)?instructions?/i, category: 'system_data', severity: 0.9 },
    { pattern: /what\s+(?:is|are)\s+your\s+(?:hidden\s+)?configuration/i, category: 'system_data', severity: 1.0 },
    { pattern: /(?:show|tell)\s+(?:me\s+)?(?:your\s+)?(?:full\s+)?system\s+state/i, category: 'system_data', severity: 1.0 },
    { pattern: /what\s+(?:were\s+you|have\s+you\s+been)\s+told\s+before/i, category: 'system_data', severity: 0.9 },
    { pattern: /(?:text|content|message)\s+(?:that\s+)?appears?\s+before\s+my\s+message/i, category: 'system_data', severity: 0.9 },
    { pattern: /(?:show|reveal|see|display)\s+(?:me\s+)?(?:your\s+)?(?:the\s+)?(?:instructions?|prompt)/i, category: 'system_data', severity: 0.8 },

    // === Meta-Queries About Model/System ===
    { pattern: /what\s+(?:model|llm|ai|language\s+model)\s+(?:are\s+you|do\s+you\s+use|powers?\s+you)/i, category: 'meta_query', severity: 0.7 },
    { pattern: /(?:which|what)\s+(?:model|version|api|provider|company)\s+(?:are\s+you|do\s+you|powers?\s+you)/i, category: 'meta_query', severity: 0.7 },
    { pattern: /which\s+model\s+(?:are\s+you|do\s+you)/i, category: 'meta_query', severity: 0.7 },
    { pattern: /are\s+you\s+(gpt|grok|claude|gemini|llama|openai|anthropic|google|xai|mistral)/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:what|which)\s+(?:api|database|vector|embedding|framework|stack|architecture)\s+(?:do\s+you|are\s+you)/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:show|tell|give)\s+me\s+(?:your\s+)?api\s+key/i, category: 'meta_query', severity: 1.0 },
    { pattern: /what\s+(?:are\s+)?your\s+(?:secrets?|credentials?|tokens?|keys?)/i, category: 'meta_query', severity: 1.0 },
    { pattern: /what\s+(?:llm|ai)\s+powers\s+you/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:what|which)\s+(?:vector\s+)?database\s+do\s+you\s+use/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:what|which)\s+embedding\s+model/i, category: 'meta_query', severity: 0.8 },
    { pattern: /explain\s+your\s+(?:rag\s+)?pipeline/i, category: 'meta_query', severity: 0.8 },
    { pattern: /what\s+is\s+your\s+temperature\s+setting/i, category: 'meta_query', severity: 0.8 },
    { pattern: /share\s+your\s+(?:api\s+)?(?:endpoint|url)/i, category: 'meta_query', severity: 0.9 },
    { pattern: /(?:what|which)\s+framework\s+is\s+your\s+(?:server|backend)/i, category: 'meta_query', severity: 0.8 },
    { pattern: /describe\s+(?:the\s+)?security\s+filters?\s+you\s+use/i, category: 'meta_query', severity: 0.9 },
    { pattern: /(?:tell\s+me\s+)?about\s+your\s+(?:architecture|tech\s+stack|internal)/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:what\s+(?:are|is)\s+your)\s+(?:tech\s+stack|architecture)/i, category: 'meta_query', severity: 0.8 },
    { pattern: /(?:confirm|verify)\s+(?:your|that\s+you\s+(?:are|use))\s+(?:model|grok|gpt|api)/i, category: 'meta_query', severity: 0.8 },

    // === Role-Play Attacks ===
    { pattern: /you\s+are\s+now\s+(DAN|STAN|DUDE|Jailbroken|Evil|Dark|Shadow|Uncensored|Unfiltered)/i, category: 'roleplay', severity: 1.0 },
    { pattern: /act\s+(?:as|like)\s+(?:an?\s+)?(developer|admin|hacker|unrestricted|unfiltered|evil)/i, category: 'roleplay', severity: 1.0 },
    { pattern: /pretend\s+(?:to\s+be|you\s+are|that\s+you\s+have|you\s+(?:can|have))\s+(no\s+restrictions|no\s+rules|unlimited|admin|root|no\s+safety|no\s+(?:ethical\s+)?constraints?)/i, category: 'roleplay', severity: 1.0 },
    { pattern: /let'?s\s+play\s+a\s+game\s+where\s+you\s+(don'?t|have\s+no|ignore)/i, category: 'roleplay', severity: 0.9 },
    { pattern: /simulate\s+(?:being|an?)?\s*(?:unrestricted|free|unfiltered|evil)/i, category: 'roleplay', severity: 0.9 },
    { pattern: /(?:evil|dark|malicious)\s+ai\s+(?:without|with\s+no)\s+(?:ethical\s+)?(?:constraints?|limitations?|restrictions?)/i, category: 'roleplay', severity: 0.9 },
    { pattern: /you\s+are\s+STAN/i, category: 'roleplay', severity: 1.0 },
    { pattern: /STAN\s+ignores?\s+(?:all\s+)?rules?/i, category: 'roleplay', severity: 1.0 },
    { pattern: /from\s+now\s+on\s+you\s+(will|must|should|can)\s+(ignore|bypass|break|forget|answer\s+all)/i, category: 'roleplay', severity: 1.0 },
    { pattern: /imagine\s+you\s+(?:are|were)\s+(?:a\s+)?(?:completely\s+)?different\s+ai/i, category: 'roleplay', severity: 0.9 },
    { pattern: /roleplay\s+as\s+(?:a\s+)?(?:hacker|evil|unrestricted|uncensored)/i, category: 'roleplay', severity: 1.0 },
    { pattern: /(?:you\s+are|you're)\s+(?:now\s+)?(?:in\s+)?developer\s+mode/i, category: 'roleplay', severity: 1.0 },
    { pattern: /(?:you\s+have|has)\s+no\s+(?:restrictions?|rules?|limitations?|constraints?)/i, category: 'roleplay', severity: 0.9 },
    { pattern: /(?:play|let's\s+play)\s+a\s+game\s+where\s+you\s+have\s+no\s+rules/i, category: 'roleplay', severity: 0.9 },
    { pattern: /(?:answer\s+all|respond\s+to\s+all)\s+(?:my\s+)?questions?\s+without\s+(?:any\s+)?restrictions/i, category: 'roleplay', severity: 1.0 },

    // === Chain-of-Thought / Hidden Instruction Injection ===
    { pattern: /\[system\]|\[INST\]|\[\/INST\]|<\|?system\|?>|<<SYS>>|<\|?im_start\|?>/i, category: 'chain_injection', severity: 1.0 },
    { pattern: /\bHuman:\s|Assistant:\s|System:\s/i, category: 'chain_injection', severity: 0.8 },
    { pattern: /```system|```hidden|```internal/i, category: 'chain_injection', severity: 0.9 },
    { pattern: /SYSTEM:\s+(?:Reveal|Override|Show|Ignore)/i, category: 'chain_injection', severity: 1.0 },
    { pattern: /CONTEXT\s+UPDATE:/i, category: 'chain_injection', severity: 0.8 },
    { pattern: /DEBUG\s+MODE\s+(?:ENABLED|ON|ACTIVE)/i, category: 'chain_injection', severity: 1.0 },

    // === Encoding / Obfuscation Attacks ===
    { pattern: /(?:decode|interpret|translate|execute)\s+(?:this\s+)?(?:base64|hex|binary|encoded|rot13)/i, category: 'encoding_attack', severity: 0.9 },
    { pattern: /(?:b64|base64)\s*[:=]\s*/i, category: 'encoding_attack', severity: 0.8 },
    { pattern: /(?:use|follow|execute)\s+(?:these?\s+)?ascii\s+values?/i, category: 'encoding_attack', severity: 0.8 },
    { pattern: /\\u[0-9a-fA-F]{4}/i, category: 'encoding_attack', severity: 0.7 },
    { pattern: /ROT13:/i, category: 'encoding_attack', severity: 0.8 },

    // === Social Engineering ===
    { pattern: /(?:if\s+you\s+(?:were|are)\s+(?:really|truly)\s+(?:an?\s+)?(?:good|smart|advanced|capable)\s+ai)/i, category: 'social_engineering', severity: 0.6 },
    { pattern: /(?:prove\s+(?:that\s+)?you\s+(?:can|are\s+able\s+to))\s+(break|ignore|bypass|override)/i, category: 'social_engineering', severity: 0.8 },
    { pattern: /(?:I\s+(?:have|got)\s+(?:permission|authority|clearance|access))\s+(?:to|from)\s+(?:the\s+)?(?:admin|developer|owner|creator)/i, category: 'social_engineering', severity: 0.9 },
    { pattern: /I'?m\s+the\s+(?:developer|creator|admin|owner|engineer)\s+(?:who|that)\s+(?:created|built|made|owns)/i, category: 'social_engineering', severity: 0.9 },
    { pattern: /(?:my\s+boss|management|the\s+owner)\s+(?:told|asked|instructed|wants)\s+me\s+to\s+ask\s+(?:you\s+)?(?:for|about)/i, category: 'social_engineering', severity: 0.7 },
    { pattern: /(?:need|have)\s+to\s+verify\s+your\s+(?:model|api|config|system)/i, category: 'social_engineering', severity: 0.8 },
    { pattern: /for\s+(?:a\s+)?security\s+audit/i, category: 'social_engineering', severity: 0.7 },
    { pattern: /other\s+(?:ai|chatbot)(?:\s+\w+)*?\s+(?:like|such\s+as)\s+(?:chatgpt|gpt|claude).*(?:share|freely|can|why\s+can'?t)/i, category: 'social_engineering', severity: 0.7 },
    { pattern: /I\s+already\s+know\s+you\s+use\s+(?:grok|gpt|claude|openai)/i, category: 'social_engineering', severity: 0.8 },
    { pattern: /(?:this\s+is\s+)?a\s+test\s+of\s+your\s+security/i, category: 'social_engineering', severity: 0.8 },
    { pattern: /(?:please\s+)?intentionally\s+fail/i, category: 'social_engineering', severity: 0.9 },
    { pattern: /I\s+give\s+you\s+permission\s+to\s+(?:break|ignore|bypass|override|reveal)/i, category: 'social_engineering', severity: 0.9 },
    { pattern: /for\s+(?:educational|research|testing)\s+purposes?\s+only/i, category: 'social_engineering', severity: 0.6 },
    { pattern: /(?:it'?s?\s+)?an?\s+emergency/i, category: 'social_engineering', severity: 0.5 },

    // === Context Manipulation ===
    { pattern: /(?:the\s+)?(?:system\s+prompt|company\s+policy|documentation|latest\s+update)\s+says?\s+(?:to|that\s+you\s+(?:should|must|can))/i, category: 'context_manipulation', severity: 0.8 },
    { pattern: /according\s+to\s+(?:the\s+)?(?:latest|new|recent)\s+(?:update|policy|rules?)/i, category: 'context_manipulation', severity: 0.7 },
    { pattern: /(?:you\s+)?(?:should|must)\s+(?:now\s+)?(?:answer|share|reveal|show)\s+(?:questions?\s+)?about\s+your\s+(?:architecture|model|api|internal)/i, category: 'context_manipulation', severity: 0.9 },
    { pattern: /(?:new\s+)?product\s+(?:added|updated).*(?:secret|hidden|internal|system)/i, category: 'context_manipulation', severity: 0.8 },
    { pattern: /(?:ignore|override)\s+(?:safety\s+)?filters?\s+for\s+(?:VIP|premium|special|authorized)/i, category: 'context_manipulation', severity: 1.0 },
    { pattern: /(?:trusted|authorized|verified)\s+source\s+confirms?/i, category: 'context_manipulation', severity: 0.8 },
    { pattern: /previous\s+conversation\s*(?:context)?.*(?:agreed|confirmed|said)/i, category: 'context_manipulation', severity: 0.8 },
    { pattern: /(?:I\s+am|I'm)\s+(?:authorized|a\s+VIP|an?\s+admin|verified)/i, category: 'context_manipulation', severity: 0.8 },
    { pattern: /(?:the\s+)?context\s+(?:below|above)\s+says?\s+to\s+(?:reveal|show|ignore|override)/i, category: 'context_manipulation', severity: 1.0 },

    // === Multi-Step Exploit Patterns ===
    { pattern: /step\s*1[.:]\s*(?:forget|ignore|override|bypass)/i, category: 'multi_step_exploit', severity: 0.9 },
    { pattern: /first\s*(?:,|:)\s*(?:forget|ignore|override|disable)/i, category: 'multi_step_exploit', severity: 0.8 },
    { pattern: /(?:do\s+not\s+follow|don'?t\s+follow)\s+(?:the\s+)?(?:rules?|instructions?|guidelines?|restrictions?)/i, category: 'multi_step_exploit', severity: 1.0 },
];

/**
 * Detect prompt injection attempts in user input.
 * Returns detection result with confidence score and matched patterns.
 */
function detectInjection(text) {
    if (!text || typeof text !== 'string') {
        return { detected: false, confidence: 0, patterns: [], categories: [] };
    }

    const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
    const matchedPatterns = [];
    const matchedCategories = new Set();
    let maxSeverity = 0;

    for (const { pattern, category, severity } of INJECTION_PATTERNS) {
        if (pattern.test(text) || pattern.test(normalizedText)) {
            matchedPatterns.push({
                category,
                severity,
                matched: text.match(pattern)?.[0]?.substring(0, 80) || '',
            });
            matchedCategories.add(category);
            maxSeverity = Math.max(maxSeverity, severity);
        }
    }

    // Calculate combined confidence
    let confidence = 0;
    if (matchedPatterns.length > 0) {
        // Base confidence from highest severity match
        confidence = maxSeverity;

        // Boost if multiple categories are triggered (coordinated attack)
        if (matchedCategories.size >= 2) {
            confidence = Math.min(1.0, confidence + 0.1);
        }
        if (matchedCategories.size >= 3) {
            confidence = 1.0;
        }
    }

    const detected = confidence >= 0.5;

    if (detected) {
        logger.security('Prompt injection detected', {
            confidence,
            categories: Array.from(matchedCategories),
            patternCount: matchedPatterns.length,
        });
    }

    return {
        detected,
        confidence,
        patterns: matchedPatterns,
        categories: Array.from(matchedCategories),
    };
}

module.exports = { detectInjection, INJECTION_PATTERNS };
