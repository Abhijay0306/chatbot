const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, security: 4 };
const COLORS = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m', security: '\x1b[35m', reset: '\x1b[0m' };

class Logger {
    constructor(minLevel = 'info') {
        this.minLevel = LEVELS[minLevel] ?? 1;
    }

    _log(level, message, meta = {}) {
        if ((LEVELS[level] ?? 1) < this.minLevel) return;
        const timestamp = new Date().toISOString();
        const color = COLORS[level] || '';
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        console.log(`${color}[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}${COLORS.reset}`);
    }

    debug(msg, meta) { this._log('debug', msg, meta); }
    info(msg, meta) { this._log('info', msg, meta); }
    warn(msg, meta) { this._log('warn', msg, meta); }
    error(msg, meta) { this._log('error', msg, meta); }
    security(msg, meta) { this._log('security', msg, meta); }
}

const logger = new Logger(process.env.LOG_LEVEL || 'info');
module.exports = { logger, Logger };
