(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  const cfg = window.NOVA_CONFIG || {};
  const BOT_ID        = cfg.botId        || 'demo';
  const THEME         = cfg.theme        || 'dark';
  const PRIMARY_COLOR = cfg.primaryColor || '#D4AF37';
  const ACCENT_COLOR  = cfg.accentColor  || '#ffffff';
  const BOT_NAME      = cfg.botName      || 'Nova AI';
  const WELCOME_MSG   = cfg.welcomeMsg   || 'Hi there! 👋 How can I help you today?';
  const API_BASE      = cfg.apiBase      || 'https://kumskid-nova-ai.pages.dev';

  // ── Shadow DOM host ──────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'nova-ai-widget-host';
  host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:inherit;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // ── Styles ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host { font-family: 'Segoe UI', system-ui, sans-serif; }

    /* ── Launcher Button ── */
    #nova-launcher {
      width: 60px; height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}cc);
      border: none; cursor: pointer;
      box-shadow: 0 4px 24px ${PRIMARY_COLOR}66, 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.3s cubic-bezier(.34,1.56,.64,1), box-shadow 0.3s;
      position: relative; overflow: hidden;
    }
    #nova-launcher::before {
      content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.25), transparent 60%);
    }
    #nova-launcher:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 32px ${PRIMARY_COLOR}88, 0 2px 12px rgba(0,0,0,0.4);
    }
    #nova-launcher svg { transition: opacity 0.2s, transform 0.3s; }
    #nova-launcher .icon-chat { opacity: 1; transform: scale(1) rotate(0deg); position: absolute; }
    #nova-launcher .icon-close { opacity: 0; transform: scale(0.5) rotate(-90deg); position: absolute; }
    #nova-launcher.open .icon-chat { opacity: 0; transform: scale(0.5) rotate(90deg); }
    #nova-launcher.open .icon-close { opacity: 1; transform: scale(1) rotate(0deg); }

    /* Notification dot */
    #nova-dot {
      position: absolute; top: 2px; right: 2px;
      width: 14px; height: 14px; border-radius: 50%;
      background: #ff4444; border: 2px solid white;
      animation: nova-pulse 2s infinite;
      display: flex; align-items: center; justify-content: center;
      font-size: 8px; color: white; font-weight: bold;
    }
    @keyframes nova-pulse {
      0%,100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,68,68,0.4); }
      50% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(255,68,68,0); }
    }

    /* ── Chat Window ── */
    #nova-window {
      position: absolute; bottom: 76px; right: 0;
      width: 360px; height: 520px;
      border-radius: 20px;
      background: ${THEME === 'dark' ? '#0f0f0f' : '#ffffff'};
      border: 1px solid ${THEME === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
      box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.85) translateY(20px);
      transform-origin: bottom right;
      opacity: 0; pointer-events: none;
      transition: transform 0.35s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease;
    }
    #nova-window.open {
      transform: scale(1) translateY(0);
      opacity: 1; pointer-events: all;
    }

    /* Header */
    #nova-header {
      padding: 16px 18px;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}22, ${PRIMARY_COLOR}08);
      border-bottom: 1px solid ${THEME === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      display: flex; align-items: center; gap: 12px;
      flex-shrink: 0;
    }
    #nova-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}88);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0;
      box-shadow: 0 2px 8px ${PRIMARY_COLOR}44;
    }
    #nova-header-info { flex: 1; }
    #nova-header-name {
      font-weight: 700; font-size: 15px;
      color: ${THEME === 'dark' ? '#ffffff' : '#0f0f0f'};
      letter-spacing: -0.3px;
    }
    #nova-header-status {
      font-size: 12px; color: #22c55e;
      display: flex; align-items: center; gap: 4px; margin-top: 2px;
    }
    #nova-header-status::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #22c55e; display: inline-block;
      animation: nova-blink 2s infinite;
    }
    @keyframes nova-blink {
      0%,100% { opacity: 1; } 50% { opacity: 0.4; }
    }
    #nova-powered {
      font-size: 10px;
      color: ${THEME === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
      text-decoration: none;
    }

    /* Messages area */
    #nova-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #nova-messages::-webkit-scrollbar { width: 4px; }
    #nova-messages::-webkit-scrollbar-track { background: transparent; }
    #nova-messages::-webkit-scrollbar-thumb {
      background: ${PRIMARY_COLOR}44; border-radius: 4px;
    }

    /* Message bubbles */
    .nova-msg { display: flex; gap: 8px; animation: nova-msg-in 0.3s cubic-bezier(.34,1.56,.64,1); }
    @keyframes nova-msg-in {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0)   scale(1); }
    }
    .nova-msg.user { flex-direction: row-reverse; }
    .nova-msg-avatar {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}88);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; align-self: flex-end;
    }
    .nova-msg.user .nova-msg-avatar {
      background: ${THEME === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
    }
    .nova-bubble {
      max-width: 75%; padding: 10px 14px;
      border-radius: 16px; font-size: 14px; line-height: 1.5;
    }
    .nova-msg.bot .nova-bubble {
      background: ${THEME === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};
      color: ${THEME === 'dark' ? '#e8e8e8' : '#1a1a1a'};
      border-bottom-left-radius: 4px;
    }
    .nova-msg.user .nova-bubble {
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}dd);
      color: ${THEME === 'dark' ? '#0f0f0f' : '#0f0f0f'};
      border-bottom-right-radius: 4px;
    }

    /* Typing indicator */
    #nova-typing { display: none; }
    #nova-typing.show { display: flex; }
    .nova-typing-dots { display: flex; gap: 4px; align-items: center; padding: 4px 2px; }
    .nova-typing-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: ${PRIMARY_COLOR}; opacity: 0.6;
      animation: nova-dot 1.2s infinite;
    }
    .nova-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .nova-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes nova-dot {
      0%,60%,100% { transform: translateY(0); opacity: 0.6; }
      30% { transform: translateY(-6px); opacity: 1; }
    }

    /* Input area */
    #nova-input-area {
      padding: 12px 14px;
      border-top: 1px solid ${THEME === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      display: flex; gap: 8px; align-items: flex-end;
      background: ${THEME === 'dark' ? '#0f0f0f' : '#ffffff'};
      flex-shrink: 0;
    }
    #nova-input {
      flex: 1; background: ${THEME === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};
      border: 1px solid ${THEME === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
      border-radius: 12px; padding: 10px 14px;
      color: ${THEME === 'dark' ? '#ffffff' : '#0f0f0f'};
      font-size: 14px; resize: none; outline: none;
      max-height: 100px; min-height: 42px;
      transition: border-color 0.2s;
      font-family: inherit; line-height: 1.4;
    }
    #nova-input::placeholder { color: ${THEME === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}; }
    #nova-input:focus { border-color: ${PRIMARY_COLOR}88; }
    #nova-send {
      width: 42px; height: 42px; border-radius: 12px;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${PRIMARY_COLOR}cc);
      border: none; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 2px 8px ${PRIMARY_COLOR}44;
    }
    #nova-send:hover { transform: scale(1.05); box-shadow: 0 4px 12px ${PRIMARY_COLOR}66; }
    #nova-send:active { transform: scale(0.95); }
    #nova-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* Branding footer */
    #nova-brand {
      text-align: center; padding: 6px;
      font-size: 10px;
      color: ${THEME === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
    }
    #nova-brand a { color: ${PRIMARY_COLOR}; text-decoration: none; }

    /* Mobile responsiveness */
    @media (max-width: 420px) {
      #nova-window { width: calc(100vw - 24px); right: -12px; height: 70vh; }
    }
  `;
  shadow.appendChild(style);

  // ── HTML Structure ────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <button id="nova-launcher" aria-label="Open Nova AI chat">
      <span id="nova-dot">1</span>
      <svg class="icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${THEME === 'dark' ? '#0f0f0f' : '#0f0f0f'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${THEME === 'dark' ? '#0f0f0f' : '#0f0f0f'}" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>

    <div id="nova-window" role="dialog" aria-label="Nova AI Chat">
      <div id="nova-header">
        <div id="nova-avatar">🤖</div>
        <div id="nova-header-info">
          <div id="nova-header-name">${BOT_NAME}</div>
          <div id="nova-header-status">Online — Ready to help</div>
        </div>
        <a id="nova-powered" href="https://kumskid-nova-ai.pages.dev" target="_blank" rel="noopener">Nova AI</a>
      </div>

      <div id="nova-messages" role="log" aria-live="polite"></div>

      <div id="nova-typing" class="nova-msg bot">
        <div class="nova-msg-avatar">🤖</div>
        <div class="nova-bubble">
          <div class="nova-typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div id="nova-input-area">
        <textarea id="nova-input" placeholder="Type your message..." rows="1" aria-label="Chat message"></textarea>
        <button id="nova-send" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${THEME === 'dark' ? '#0f0f0f' : '#0f0f0f'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      <div id="nova-brand">Powered by <a href="https://kumskid-nova-ai.pages.dev" target="_blank" rel="noopener">KUMSKID Nova AI</a></div>
    </div>
  `;
  shadow.appendChild(wrapper);

  // ── Elements ──────────────────────────────────────────────────────────────
  const launcher  = shadow.getElementById('nova-launcher');
  const window_   = shadow.getElementById('nova-window');
  const messages  = shadow.getElementById('nova-messages');
  const input     = shadow.getElementById('nova-input');
  const sendBtn   = shadow.getElementById('nova-send');
  const typing    = shadow.getElementById('nova-typing');
  const dot       = shadow.getElementById('nova-dot');

  // ── State ─────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isTyping = false;
  let conversationHistory = [];
  let sessionId = 'session_' + Math.random().toString(36).substr(2, 9);

  // ── Toggle ────────────────────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    launcher.classList.toggle('open', isOpen);
    window_.classList.toggle('open', isOpen);
    if (isOpen) {
      dot.style.display = 'none';
      if (messages.children.length === 0) showWelcome();
      setTimeout(() => input.focus(), 350);
    }
  }

  launcher.addEventListener('click', toggleChat);

  // ── Welcome message ───────────────────────────────────────────────────────
  function showWelcome() {
    addMessage('bot', WELCOME_MSG);
  }

  // ── Add message bubble ────────────────────────────────────────────────────
  function addMessage(role, text) {
    const msg = document.createElement('div');
    msg.className = `nova-msg ${role}`;
    const avatar = role === 'bot' ? '🤖' : '👤';
    msg.innerHTML = `
      <div class="nova-msg-avatar">${avatar}</div>
      <div class="nova-bubble">${escapeHTML(text)}</div>
    `;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  function escapeHTML(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
  }

  // ── Typing indicator ──────────────────────────────────────────────────────
  function showTyping() {
    isTyping = true;
    typing.classList.add('show');
    messages.scrollTop = messages.scrollHeight;
  }
  function hideTyping() {
    isTyping = false;
    typing.classList.remove('show');
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    addMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    showTyping();

    try {
      const reply = await fetchBotReply(text);
      hideTyping();
      addMessage('bot', reply);
      conversationHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      hideTyping();
      addMessage('bot', 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.');
    }

    sendBtn.disabled = false;
    input.focus();
  }

  // ── API call to Nova AI backend ───────────────────────────────────────────
  async function fetchBotReply(userMessage) {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId: BOT_ID,
        sessionId: sessionId,
        message: userMessage,
        history: conversationHistory.slice(-10)
      })
    });

    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    return data.reply || data.message || 'I received your message!';
  }

  // ── Input auto-resize + keyboard ──────────────────────────────────────────
  input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  // ── Auto-open after delay (optional) ─────────────────────────────────────
  if (cfg.autoOpen) {
    setTimeout(toggleChat, cfg.autoOpenDelay || 3000);
  }

  // ── Expose public API ─────────────────────────────────────────────────────
  window.NovaAI = {
    open:  () => { if (!isOpen) toggleChat(); },
    close: () => { if (isOpen)  toggleChat(); },
    toggle: toggleChat,
    sendMessage: (msg) => { if (isOpen) { input.value = msg; sendMessage(); } }
  };

})();
