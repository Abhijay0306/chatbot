const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const cheerio = require('cheerio');
const { logger } = require('../utils/logger');

/**
 * Parse a PDF file and extract text content.
 */
async function parsePDF(filePath) {
    logger.info(`Parsing PDF: ${path.basename(filePath)}`);
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return {
        content: data.text.trim(),
        metadata: {
            source: path.basename(filePath),
            type: 'pdf',
            pages: data.numpages,
        },
    };
}

/**
 * Parse a DOCX file and extract text content.
 */
async function parseDOCX(filePath) {
    logger.info(`Parsing DOCX: ${path.basename(filePath)}`);
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return {
        content: result.value.trim(),
        metadata: {
            source: path.basename(filePath),
            type: 'docx',
        },
    };
}

/**
 * Parse an HTML file and extract text content.
 */
async function parseHTML(filePath) {
    logger.info(`Parsing HTML: ${path.basename(filePath)}`);
    const html = fs.readFileSync(filePath, 'utf-8');
    const $ = cheerio.load(html);

    // Remove script and style elements
    $('script, style, nav, footer, header').remove();

    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return {
        content: text,
        metadata: {
            source: path.basename(filePath),
            type: 'html',
            title: $('title').text().trim() || undefined,
        },
    };
}

/**
 * Extract table-like structures from text and output as structured JSON.
 * Detects common table formats (pipe-delimited, tab-delimited).
 */
function extractTables(text) {
    const tables = [];

    // Detect pipe-delimited tables (markdown-style)
    const pipeTableRegex = /(?:^|\n)((?:\|[^\n]+\|\n?){2,})/g;
    let match;
    while ((match = pipeTableRegex.exec(text)) !== null) {
        const rows = match[1].trim().split('\n').map(row =>
            row.split('|').filter(cell => cell.trim() && !cell.match(/^[-:]+$/)).map(cell => cell.trim())
        ).filter(row => row.length > 0);

        if (rows.length >= 2) {
            const headers = rows[0];
            const dataRows = rows.slice(1).filter(r => !r.every(c => /^[-:]+$/.test(c)));
            const tableData = dataRows.map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                return obj;
            });
            tables.push({ headers, data: tableData });
        }
    }

    // Detect tab-delimited tables
    const lines = text.split('\n');
    let tabTableStart = -1;
    for (let i = 0; i < lines.length; i++) {
        const tabCount = (lines[i].match(/\t/g) || []).length;
        if (tabCount >= 2) {
            if (tabTableStart === -1) tabTableStart = i;
        } else if (tabTableStart !== -1 && i - tabTableStart >= 2) {
            const tableLines = lines.slice(tabTableStart, i);
            const rows = tableLines.map(l => l.split('\t').map(c => c.trim()));
            const headers = rows[0];
            const dataRows = rows.slice(1);
            tables.push({
                headers,
                data: dataRows.map(row => {
                    const obj = {};
                    headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });
                    return obj;
                }),
            });
            tabTableStart = -1;
        }
    }

    return tables;
}

/**
 * Parse any supported file based on extension.
 */
async function parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.pdf': return parsePDF(filePath);
        case '.docx': return parseDOCX(filePath);
        case '.html':
        case '.htm': return parseHTML(filePath);
        default:
            // Try to read as plain text
            logger.warn(`Unknown file type ${ext}, reading as plain text: ${path.basename(filePath)}`);
            const content = fs.readFileSync(filePath, 'utf-8');
            return {
                content: content.trim(),
                metadata: { source: path.basename(filePath), type: 'text' },
            };
    }
}

module.exports = { parsePDF, parseDOCX, parseHTML, extractTables, parseFile };
