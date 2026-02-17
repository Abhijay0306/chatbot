/**
 * Load Controls Chat Widget — Embeddable JavaScript
 * Features: SSE streaming (typewriter effect), source document cards, humanized UI.
 */
(function () {
    'use strict';

    const StoreChat = {
        config: {
            apiUrl: '',
            position: 'bottom-right',
            primaryColor: '#0059B3',
            title: 'Load Controls Support',
            subtitle: 'Ask us about our products!',
            placeholder: 'How can we help you today?',
            welcomeMessage: "Hi, I'm here to help with anything related to our Load Controls products -- installation, specifications, troubleshooting, you name it. What can I help you with?",
            quickLinks: [
                { label: 'Data Sheet', icon: 'grid', url: 'https://www.loadcontrols.com/data-sheets' },
                { label: 'Quick Start', icon: 'clock', url: 'https://www.loadcontrols.com/quick-start' },
                { label: 'How to Install Videos', icon: 'video', url: 'https://www.loadcontrols.com/how-to-install-videos' },
                { label: 'Installation Guide', icon: 'doc', url: 'https://www.loadcontrols.com/installation-guides' },
            ],
        },
        isOpen: false,
        messages: [],
        isLoading: false,

        init(options = {}) {
            Object.assign(this.config, options);

            // Remove trailing slash from apiUrl if present (fixes double slash redirects)
            if (this.config.apiUrl && this.config.apiUrl.endsWith('/')) {
                this.config.apiUrl = this.config.apiUrl.slice(0, -1);
            }

            this._injectStyles();
            this._buildUI();
            this._bindEvents();
            this._addMessage('bot', this.config.welcomeMessage);
        },

        _injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
        :root {
          --chat-primary: ${this.config.primaryColor};
        }
      `;
            document.head.appendChild(style);
        },

        _buildUI() {
            // Toggle button
            const toggle = document.createElement('button');
            toggle.className = `sc-toggle ${this.config.position}`;
            toggle.id = 'sc-toggle';
            toggle.setAttribute('aria-label', 'Open chat');
            toggle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>`;
            document.body.appendChild(toggle);

            // Chat window
            const win = document.createElement('div');
            win.className = `sc-window ${this.config.position}`;
            win.id = 'sc-window';
            win.innerHTML = `
        <div class="sc-header">
          <div class="sc-header-avatar">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
            </svg>
          </div>
          <div class="sc-header-info">
            <h3 class="sc-header-title">${this.config.title}</h3>
            <p class="sc-header-subtitle">${this.config.subtitle}</p>
          </div>
          <button class="sc-header-close" id="sc-close" aria-label="Close chat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="sc-messages" id="sc-messages"></div>
        <div class="sc-input-area">
          <textarea class="sc-input" id="sc-input" placeholder="${this.config.placeholder}" rows="1"></textarea>
          <button class="sc-send" id="sc-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        ${this._buildQuickLinks()}`;
            document.body.appendChild(win);
        },

        _buildQuickLinks() {
            if (!this.config.quickLinks || this.config.quickLinks.length === 0) return '';
            const items = this.config.quickLinks.map(link => {
                return `<a class="sc-quick-link" href="${link.url}" target="_blank" rel="noopener noreferrer">
                    ${this._quickLinkIcon(link.icon)}
                    <span>${link.label}</span>
                </a>`;
            }).join('');
            return `<div class="sc-quick-links">${items}</div>`;
        },

        _quickLinkIcon(type) {
            const icons = {
                grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect></svg>',
                clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
                video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="2" y="4" width="15" height="16" rx="2"></rect><polygon points="22 8 17 12 22 16 22 8"></polygon></svg>',
                doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
            };
            return icons[type] || icons.doc;
        },

        _bindEvents() {
            const toggle = document.getElementById('sc-toggle');
            const close = document.getElementById('sc-close');
            const input = document.getElementById('sc-input');
            const send = document.getElementById('sc-send');

            toggle.addEventListener('click', () => this._toggle());
            close.addEventListener('click', () => this._toggle());
            send.addEventListener('click', () => this._send());

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._send();
                }
            });

            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 80) + 'px';
            });
        },

        _toggle() {
            this.isOpen = !this.isOpen;
            const win = document.getElementById('sc-window');
            const toggle = document.getElementById('sc-toggle');

            if (this.isOpen) {
                win.classList.add('visible');
                toggle.classList.add('open');
                document.getElementById('sc-input').focus();
            } else {
                win.classList.remove('visible');
                toggle.classList.remove('open');
            }
        },

        _addMessage(type, text, extras = {}) {
            const container = document.getElementById('sc-messages');
            const msgEl = document.createElement('div');
            msgEl.className = `sc-msg sc-msg-${type}`;

            if (type === 'bot') {
                msgEl.innerHTML = this._parseMarkdown(text);
            } else {
                msgEl.textContent = text;
            }
            container.appendChild(msgEl);

            // Add source cards if present
            if (extras.sources && extras.sources.length > 0) {
                this._addSourceCards(container, extras.sources);
            }

            this._scrollToBottom();
            this.messages.push({ type, text, timestamp: Date.now() });
            return msgEl;
        },

        /**
         * Create a streaming bot message element with a blinking cursor.
         */
        _createStreamingMessage() {
            const container = document.getElementById('sc-messages');
            const msgEl = document.createElement('div');
            msgEl.className = 'sc-msg sc-msg-bot sc-msg-streaming';
            msgEl.id = 'sc-streaming-msg';

            const contentEl = document.createElement('span');
            contentEl.className = 'sc-stream-content';
            msgEl.appendChild(contentEl);

            const cursor = document.createElement('span');
            cursor.className = 'sc-stream-cursor';
            cursor.textContent = '▌';
            msgEl.appendChild(cursor);

            container.appendChild(msgEl);
            this._scrollToBottom();
            return { msgEl, contentEl };
        },

        /**
         * Append a chunk of text to the streaming message with typewriter feel.
         */
        _appendStreamChunk(contentEl, chunk) {
            // Parse markdown on the full accumulated text
            const currentText = (contentEl._rawText || '') + chunk;
            contentEl._rawText = currentText;
            contentEl.innerHTML = this._parseMarkdown(currentText);
            this._scrollToBottom();
        },

        /**
         * Finalize streaming message: remove cursor, add sources.
         */
        _finalizeStream(msgEl, sources) {
            msgEl.classList.remove('sc-msg-streaming');
            const cursor = msgEl.querySelector('.sc-stream-cursor');
            if (cursor) cursor.remove();

            // Add source cards below the message
            if (sources && sources.length > 0) {
                const container = document.getElementById('sc-messages');
                this._addSourceCards(container, sources);
            }

            this.messages.push({
                type: 'bot',
                text: msgEl.querySelector('.sc-stream-content')?._rawText || '',
                timestamp: Date.now(),
            });
        },

        /**
         * Add source reference cards below a message.
         */
        _addSourceCards(container, sources) {
            const srcContainer = document.createElement('div');
            srcContainer.className = 'sc-sources';

            const label = document.createElement('div');
            label.className = 'sc-sources-label';
            label.textContent = 'Referenced Documents';
            srcContainer.appendChild(label);

            for (const src of sources) {
                const card = document.createElement('a');
                card.className = 'sc-source-card';
                card.href = `${this.config.apiUrl}${src.url}`;
                card.target = '_blank';
                card.rel = 'noopener noreferrer';
                card.innerHTML = `
                    <div class="sc-source-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div class="sc-source-info">
                        <div class="sc-source-name">${this._escapeHtml(src.filename)}</div>
                        <div class="sc-source-category">${this._escapeHtml(src.category)}</div>
                    </div>
                    <div class="sc-source-arrow">→</div>`;
                srcContainer.appendChild(card);
            }

            container.appendChild(srcContainer);
            this._scrollToBottom();
        },

        _showTyping() {
            const container = document.getElementById('sc-messages');
            const typing = document.createElement('div');
            typing.className = 'sc-msg sc-msg-bot';
            typing.id = 'sc-typing';
            typing.innerHTML = '<div class="sc-typing"><span></span><span></span><span></span></div>';
            container.appendChild(typing);
            this._scrollToBottom();
        },

        _removeTyping() {
            const typing = document.getElementById('sc-typing');
            if (typing) typing.remove();
        },

        async _send() {
            const input = document.getElementById('sc-input');
            const text = input.value.trim();
            if (!text || this.isLoading) return;

            this._addMessage('user', text);
            input.value = '';
            input.style.height = 'auto';

            this.isLoading = true;
            document.getElementById('sc-send').disabled = true;
            this._showTyping();

            try {
                // Use streaming endpoint
                const response = await fetch(`${this.config.apiUrl}/api/chat/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: text }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                this._removeTyping();

                // Create streaming message element
                const { msgEl, contentEl } = this._createStreamingMessage();

                // Read the SSE stream
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let sources = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.replace) {
                                // Output filter replaced the response
                                contentEl._rawText = data.replace;
                                contentEl.innerHTML = this._parseMarkdown(data.replace);
                            } else if (data.chunk) {
                                this._appendStreamChunk(contentEl, data.chunk);
                            }

                            if (data.sources) {
                                sources = data.sources;
                            }

                            if (data.done) {
                                this._finalizeStream(msgEl, sources);
                            }
                        } catch (e) {
                            // Skip malformed SSE events
                        }
                    }
                }

                // Ensure finalized even if last event was in buffer
                if (msgEl.classList.contains('sc-msg-streaming')) {
                    this._finalizeStream(msgEl, sources);
                }
            } catch (error) {
                this._removeTyping();
                // Remove any partial streaming message
                const partial = document.getElementById('sc-streaming-msg');
                if (partial) partial.remove();

                // Fallback to non-streaming endpoint
                try {
                    const fallbackRes = await fetch(`${this.config.apiUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text }),
                    });
                    const data = await fallbackRes.json();
                    this._addMessage('bot', data.response, { sources: data.sources });
                } catch (e2) {
                    this._addMessage('bot', "I'm having trouble connecting right now. Please try again in a moment.");
                }
            }

            this.isLoading = false;
            document.getElementById('sc-send').disabled = false;
        },

        _scrollToBottom() {
            const container = document.getElementById('sc-messages');
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 50);
        },

        _parseMarkdown(text) {
            let html = this._escapeHtml(text);
            // Bold
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            // Inline code
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
            // Bullet lists
            html = html.replace(/^[\s]*[-•]\s+(.+)/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
            // Numbered lists
            html = html.replace(/^[\s]*\d+\.\s+(.+)/gm, '<li>$1</li>');
            // Line breaks
            html = html.replace(/\n/g, '<br>');
            return html;
        },

        _escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },
    };

    window.StoreChat = StoreChat;
})();
