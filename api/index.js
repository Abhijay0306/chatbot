/**
 * Vercel Serverless Function Entry Point
 * 
 * Wraps the Express app for Vercel's serverless environment.
 * The Express app handles all /api/* and /documents/* routes.
 * Static files (widget.js, widget.css, index.html) are served by Vercel CDN from public/.
 */

const app = require('../src/server');

module.exports = app;
