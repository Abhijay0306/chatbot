# Load Controls AI Chatbot

A secure, production-ready AI chatbot for Load Controls Incorporated — answering technical questions from approved documentation with zero hallucination tolerance and multi-layer security.

## Features

- **RAG Pipeline** — Hybrid search (vector similarity + TF-IDF) across 578 indexed document chunks
- **85+ Security Patterns** — Prompt injection, jailbreak, data exfiltration, encoding attacks, social engineering detection
- **Zero Hallucination** — Context-only answers grounded in Load Controls documentation
- **Local Embeddings** — `all-MiniLM-L6-v2` via Transformers.js (no external API cost)
- **Output Filtering** — Blocks model/architecture/prompt leakage from LLM responses
- **Embeddable Widget** — Drop-in chat widget for Shopify or any website
- **Query Caching** — LRU cache to reduce LLM calls on repeated questions

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
copy .env.example .env
# Edit .env → set GROK_API_KEY=your_key_here

# Ingest documents (already done if data/index/ exists)
npm run ingest

# Start server
npm start
```

Open **http://localhost:3000** to test the chat widget.

## Project Structure

```
├── data/
│   ├── Documents/          # Source PDFs & DOCX (9 subfolders, 56 files)
│   ├── index/              # Vector store index (auto-generated)
│   └── sample_catalog.json # Product catalog (optional)
├── public/
│   ├── index.html          # Demo page
│   ├── widget.js           # Embeddable chat widget
│   └── widget.css          # Widget styles
├── shopify/
│   └── embed_snippet.liquid # Shopify theme integration
├── src/
│   ├── config.js           # Centralized configuration
│   ├── server.js           # Express API server
│   ├── cache/
│   │   └── query_cache.js  # LRU query cache
│   ├── embeddings/
│   │   └── embedder.js     # Local embedding model wrapper
│   ├── ingestion/
│   │   ├── pipeline.js     # Main ingestion orchestrator
│   │   ├── parsers.js      # PDF, DOCX, HTML parsers
│   │   ├── chunker.js      # Text chunking with overlap
│   │   └── catalog.js      # Product catalog normalizer
│   ├── llm/
│   │   ├── grok_client.js  # Grok API client (OpenAI-compatible)
│   │   ├── system_prompt.js # Hardened system prompt
│   │   └── response_handler.js # Response validation & formatting
│   ├── recommendations/
│   │   └── engine.js       # Product recommendation engine
│   ├── retrieval/
│   │   └── hybrid_search.js # Vector + TF-IDF with RRF fusion
│   ├── security/
│   │   ├── middleware.js    # Security pipeline orchestrator
│   │   ├── input_sanitizer.js  # Unicode, zalgo, homoglyph normalization
│   │   ├── injection_detector.js # 85+ regex attack patterns
│   │   ├── intent_classifier.js  # SAFE/SUSPICIOUS/MALICIOUS
│   │   └── output_filter.js # LLM response leakage scanner
│   ├── utils/
│   │   └── logger.js       # Structured logging
│   └── vectorstore/
│       └── faiss_store.js  # Pure JS vector store (cosine similarity)
└── tests/
    ├── adversarial/
    │   ├── attacks.json    # 63 attack prompts across 6 categories
    │   └── test_runner.js  # Automated adversarial test runner
    └── unit/
        └── security.test.js # 37 unit tests for security modules
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message (`{ "message": "..." }`) |
| `GET` | `/api/health` | Health check + stats |
| `POST` | `/api/admin/ingest` | Re-run document ingestion |

## Security Architecture

```
User Input → Sanitizer → Injection Detector → Intent Classifier
                                                    │
                              ┌──────────────────────┤
                              ▼                      ▼
                         MALICIOUS              SAFE/SUSPICIOUS
                         (blocked)              (proceed to LLM)
                                                    │
                                                    ▼
                                            LLM Response
                                                    │
                                                    ▼
                                            Output Filter
                                            (leakage scan)
                                                    │
                                                    ▼
                                              User Response
```

**Input Security:**
- Invisible/control character stripping
- Zalgo text + combining diacritical mark removal
- Greek/Cyrillic homoglyph → Latin normalization
- Fullwidth character normalization
- Base64 payload detection
- 85+ injection patterns across 9 categories

**Output Security:**
- Model/provider name leak detection
- System prompt disclosure blocking
- Architecture/infrastructure leak scanning
- API key/credential exposure prevention

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GROK_API_KEY` | — | **Required.** xAI API key |
| `GROK_MODEL` | `grok-4.1-fast` | Model name |
| `PORT` | `3000` | Server port |
| `CHUNK_SIZE` | `512` | Document chunk size (chars) |
| `CHUNK_OVERLAP` | `50` | Chunk overlap (chars) |
| `TOP_K` | `5` | Number of retrieval results |
| `LLM_TEMPERATURE` | `0.1` | LLM temperature (low = precise) |
| `LLM_MAX_TOKENS` | `500` | Max response tokens |
| `CACHE_MAX_SIZE` | `100` | Max cached queries |
| `RATE_LIMIT_MAX_REQUESTS` | `20` | Requests per minute per IP |

## Testing

```bash
# Run all tests
npm test

# Unit tests only
node tests/unit/security.test.js

# Adversarial tests only
node tests/adversarial/test_runner.js
```

**Current results:** 134/134 adversarial + 37/37 unit tests passing.

## Shopify Integration

1. Deploy the server to a public URL
2. Edit `shopify/embed_snippet.liquid` — replace `YOUR_SERVER_URL`
3. In Shopify Admin → Themes → Edit Code → `theme.liquid`
4. Paste the snippet before `</body>`

## Document Ingestion

Place files in `data/Documents/` (supports nested subfolders):

| Format | Parser |
|--------|--------|
| `.pdf` | pdf-parse |
| `.docx` | mammoth |
| `.html` | cheerio |
| `.txt` | raw text |

Run `npm run ingest` to rebuild the index.

## License

Proprietary — Load Controls Incorporated
