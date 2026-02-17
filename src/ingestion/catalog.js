const fs = require('fs');
const { logger } = require('../utils/logger');

/**
 * Normalize a product catalog JSON file into searchable documents.
 */
function normalizeCatalog(catalogPath) {
    if (!fs.existsSync(catalogPath)) {
        logger.warn(`Catalog file not found: ${catalogPath}`);
        return [];
    }

    const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    const products = Array.isArray(raw) ? raw : (raw.products || []);

    logger.info(`Normalizing ${products.length} products from catalog`);

    return products.map(product => {
        // Create a rich text representation for embedding
        const variantText = (product.variants || [])
            .map(v => {
                const parts = [];
                if (v.size) parts.push(`Size: ${v.size}`);
                if (v.color) parts.push(`Color: ${v.color}`);
                if (v.inventory !== undefined) parts.push(`In stock: ${v.inventory}`);
                return parts.join(', ');
            })
            .join(' | ');

        const tagsText = (product.tags || []).join(', ');

        const searchableText = [
            `Product: ${product.name}`,
            `Description: ${product.description || ''}`,
            `Price: ${product.currency || 'USD'} ${product.price}`,
            `Category: ${product.category || ''}`,
            tagsText ? `Tags: ${tagsText}` : '',
            variantText ? `Variants: ${variantText}` : '',
        ].filter(Boolean).join('\n');

        return {
            id: `product_${product.id}`,
            text: searchableText,
            metadata: {
                source: 'product_catalog',
                type: 'product',
                productId: product.id,
                productName: product.name,
                price: product.price,
                currency: product.currency || 'USD',
                category: product.category,
                tags: product.tags || [],
                url: product.url || '',
                variants: product.variants || [],
            },
        };
    });
}

module.exports = { normalizeCatalog };
