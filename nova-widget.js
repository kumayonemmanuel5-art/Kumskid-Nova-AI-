(function () {
  'use strict';

  // ── Config from client's embed code ──────────────────────────────────────
  const cfg = window.NOVA_CONFIG || {};
  let BOT_ID        = cfg.botId        || 'demo';
  let THEME         = cfg.theme        || 'dark';
  let PRIMARY_COLOR = cfg.primaryColor || '#D4AF37';
  let BOT_NAME      = cfg.botName      || 'Nova AI';
  let WELCOME_MSG   = cfg.welcomeMsg   || 'Hi there! How can I help you today?';
  const API_BASE    = cfg.apiBase      || 'https://kumskid-nova-ai.pages.dev';

  // ── Session ID — unique per visitor browser session ───────────────────────
  let sessionId = sessionStorage.getItem('nova_session_id');
  if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    sessionStorage.setItem('nova_session_id', sessionId);
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let isOpen              = false;
  let isTyping            = false;
  let conversationHistory = [];
  let botLoaded           = false;
  let leadCaptured        = sessionStorage.getItem('nova_lead_captured') === 'true';
  let messageCount        = 0;

  // ── Shadow DOM host ───────────────────────────────────────────────────────
  const BOTTOM_OFFSET = cfg.bottomOffset || '24px';
  const RIGHT_OFFSET  = cfg.rightOffset  || '24px';

  const host = document.createElement('div');
  host.id = 'nova-ai-widget-host';
  host.style.cssText = 'position:fixed;bottom:' + BOTTOM_OFFSET + ';right:' + RIGHT_OFFSET + ';z-index:2147483647;font-family:inherit;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // ── Build styles ──────────────────────────────────────────────────────────
  function buildStyles(color, theme) {
    return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { font-family: 'Segoe UI', system-ui, sans-serif; }

    #nova-launcher {
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, ${color}, ${color}cc);
      border: none; cursor: pointer;
      box-shadow: 0 4px 24px ${color}66, 0 2px 8px rgba(0,0,0,0.3);
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
      box-shadow: 0 6px 32px ${color}88, 0 2px 12px rgba(0,0,0,0.4);
    }
    #nova-launcher svg { transition: opacity 0.2s, transform 0.3s; }
    #nova-launcher .icon-chat { opacity: 1; transform: scale(1) rotate(0deg); position: absolute; }
    #nova-launcher .icon-close { opacity: 0; transform: scale(0.5) rotate(-90deg); position: absolute; }
    #nova-launcher.open .icon-chat { opacity: 0; transform: scale(0.5) rotate(90deg); }
    #nova-launcher.open .icon-close { opacity: 1; transform: scale(1) rotate(0deg); }

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

    #nova-window {
      position: absolute; bottom: 76px; right: 0;
      width: 360px; height: 520px; border-radius: 20px;
      background: ${theme === 'dark' ? '#0f0f0f' : '#ffffff'};
      border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'};
      box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 4px 20px rgba(0,0,0,0.2);
      display: flex; flex-direction: column; overflow: hidden;
      transform: scale(0.85) translateY(20px); transform-origin: bottom right;
      opacity: 0; pointer-events: none;
      transition: transform 0.35s cubic-bezier(.34,1.56,.64,1), opacity 0.25s ease;
    }
    #nova-window.open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }

    #nova-header {
      padding: 16px 18px;
      background: linear-gradient(135deg, ${color}22, ${color}08);
      border-bottom: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    #nova-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: linear-gradient(135deg, ${color}, ${color}88);
      display: flex; align-items: center; justify-content: center;
      font-size: 18px; flex-shrink: 0; box-shadow: 0 2px 8px ${color}44;
    }
    #nova-header-info { flex: 1; }
    #nova-header-name {
      font-weight: 700; font-size: 15px;
      color: ${theme === 'dark' ? '#ffffff' : '#0f0f0f'}; letter-spacing: -0.3px;
    }
    #nova-header-status {
      font-size: 12px; color: #22c55e;
      display: flex; align-items: center; gap: 4px; margin-top: 2px;
    }
    #nova-header-status::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #22c55e; display: inline-block; animation: nova-blink 2s infinite;
    }
    @keyframes nova-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    #nova-powered {
      font-size: 10px;
      color: ${theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
      text-decoration: none;
    }

    #nova-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth;
    }
    #nova-messages::-webkit-scrollbar { width: 4px; }
    #nova-messages::-webkit-scrollbar-track { background: transparent; }
    #nova-messages::-webkit-scrollbar-thumb { background: ${color}44; border-radius: 4px; }

    .nova-msg { display: flex; gap: 8px; animation: nova-msg-in 0.3s cubic-bezier(.34,1.56,.64,1); }
    @keyframes nova-msg-in {
      from { opacity: 0; transform: translateY(10px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .nova-msg.user { flex-direction: row-reverse; }
    .nova-msg-avatar {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      background: linear-gradient(135deg, ${color}, ${color}88);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; align-self: flex-end;
    }
    .nova-msg.user .nova-msg-avatar {
      background: ${theme === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'};
    }
    .nova-bubble {
      max-width: 75%; padding: 10px 14px;
      border-radius: 16px; font-size: 14px; line-height: 1.5;
    }
    .nova-msg.bot .nova-bubble {
      background: ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};
      color: ${theme === 'dark' ? '#e8e8e8' : '#1a1a1a'}; border-bottom-left-radius: 4px;
    }
    .nova-msg.user .nova-bubble {
      background: linear-gradient(135deg, ${color}, ${color}dd);
      color: #0f0f0f; border-bottom-right-radius: 4px;
    }

    #nova-typing { display: none; }
    #nova-typing.show { display: flex; }
    .nova-typing-dots { display: flex; gap: 4px; align-items: center; padding: 4px 2px; }
    .nova-typing-dots span {
      width: 6px; height: 6px; border-radius: 50%;
      background: ${color}; opacity: 0.6; animation: nova-dot 1.2s infinite;
    }
    .nova-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .nova-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes nova-dot {
      0%,60%,100% { transform: translateY(0); opacity: 0.6; }
      30% { transform: translateY(-6px); opacity: 1; }
    }

    #nova-input-area {
      padding: 12px 14px;
      border-top: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      display: flex; gap: 8px; align-items: flex-end;
      background: ${theme === 'dark' ? '#0f0f0f' : '#ffffff'}; flex-shrink: 0;
    }
    #nova-input {
      flex: 1; background: ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};
      border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
      border-radius: 12px; padding: 10px 14px;
      color: ${theme === 'dark' ? '#ffffff' : '#0f0f0f'};
      font-size: 14px; resize: none; outline: none;
      max-height: 100px; min-height: 42px;
      transition: border-color 0.2s; font-family: inherit; line-height: 1.4;
    }
    #nova-input::placeholder { color: ${theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}; }
    #nova-input:focus { border-color: ${color}88; }
    #nova-send {
      width: 42px; height: 42px; border-radius: 12px;
      background: linear-gradient(135deg, ${color}, ${color}cc);
      border: none; cursor: pointer; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 8px ${color}44;
    }
    #nova-send:hover { transform: scale(1.05); box-shadow: 0 4px 12px ${color}66; }
    #nova-send:active { transform: scale(0.95); }
    #nova-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    /* Lead capture form */
    #nova-lead-form {
      padding: 14px 16px;
      background: ${theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'};
      border-top: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
      flex-shrink: 0;
    }
    #nova-lead-form p {
      font-size: 12px; color: ${theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'};
      margin-bottom: 8px; line-height: 1.5;
    }
    #nova-lead-form-row { display: flex; gap: 6px; }
    #nova-lead-email {
      flex: 1; background: ${theme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};
      border: 1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
      border-radius: 8px; padding: 8px 10px;
      color: ${theme === 'dark' ? '#ffffff' : '#0f0f0f'};
      font-size: 12px; outline: none; font-family: inherit;
    }
    #nova-lead-email:focus { border-color: ${color}88; }
    #nova-lead-email::placeholder { color: ${theme === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'}; }
    #nova-lead-submit {
      padding: 8px 12px; border-radius: 8px;
      background: linear-gradient(135deg, ${color}, ${color}cc);
      color: #000; font-size: 11px; font-weight: 700;
      border: none; cursor: pointer; white-space: nowrap;
      font-family: inherit;
    }
    #nova-lead-dismiss {
      background: none; border: none; cursor: pointer;
      font-size: 10px; color: ${theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
      padding: 4px; font-family: inherit; display: block; text-align: center; margin-top: 4px;
    }

    #nova-brand {
      text-align: center; padding: 6px; font-size: 10px;
      color: ${theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'};
    }
    #nova-brand a { color: ${color}; text-decoration: none; }

    @media (max-width: 420px) {
      #nova-window { width: calc(100vw - 24px); right: -12px; height: 70vh; }
    }
  `;
  }

  // ── Build HTML ────────────────────────────────────────────────────────────
  function buildHTML(botName, theme) {
    const strokeColor = '#0f0f0f';
    return `
    <button id="nova-launcher" aria-label="Open Nova AI chat">
      <span id="nova-dot">1</span>
      <svg class="icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <svg class="icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div id="nova-window" role="dialog" aria-label="Nova AI Chat">
      <div id="nova-header">
        <div id="nova-avatar">🤖</div>
        <div id="nova-header-info">
          <div id="nova-header-name">${botName}</div>
          <div id="nova-header-status">Online — Ready to help</div>
        </div>
        <a id="nova-powered" href="https://kumskid-nova-ai.pages.dev" target="_blank" rel="noopener">Nova AI</a>
      </div>
      <div id="nova-messages" role="log" aria-live="polite"></div>
      <div id="nova-typing" class="nova-msg bot">
        <div class="nova-msg-avatar">🤖</div>
        <div class="nova-bubble">
          <div class="nova-typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
      <div id="nova-input-area">
        <textarea id="nova-input" placeholder="Type your message..." rows="1" aria-label="Chat message"></textarea>
        <button id="nova-send" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div id="nova-brand">Powered by <a href="https://kumskid-nova-ai.pages.dev" target="_blank" rel="noopener">KUMSKID Nova AI</a></div>
    </div>`;
  }

  // ── Initialize widget ─────────────────────────────────────────────────────
  function initWidget() {
    const style = document.createElement('style');
    style.textContent = buildStyles(PRIMARY_COLOR, THEME);
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML(BOT_NAME, THEME);
    shadow.appendChild(wrapper);

    bindEvents();

    // Load real bot config + system prompt from Supabase
    if (BOT_ID !== 'demo') {
      loadBotConfig();
      loadBotPrompt(BOT_ID); // load system prompt immediately on widget init
    }
  }

  // ── Load bot config from Supabase via worker ──────────────────────────────
  async function loadBotConfig() {
    try {
      const res  = await fetch(`${API_BASE}/api/bots/${BOT_ID}`);
      const data = await res.json();

      if (data.error) {
        console.warn('Nova AI: ' + data.error);
        return;
      }

      // Update widget with real bot data
      BOT_NAME    = data.botName    || BOT_NAME;
      WELCOME_MSG = data.welcomeMessage || WELCOME_MSG;
      PRIMARY_COLOR = data.primaryColor || PRIMARY_COLOR;
      THEME       = data.theme      || THEME;

      // Update header name
      const nameEl = shadow.getElementById('nova-header-name');
      if (nameEl) nameEl.textContent = BOT_NAME;

      botLoaded = true;
      loadBotPrompt(BOT_ID);

    } catch(e) {
      console.warn('Nova AI: Could not load bot config', e.message);
    }
  }

  // ── Bind all events ───────────────────────────────────────────────────────
  function bindEvents() {
    const launcher = shadow.getElementById('nova-launcher');
    const input    = shadow.getElementById('nova-input');
    const sendBtn  = shadow.getElementById('nova-send');
    const dot      = shadow.getElementById('nova-dot');

    launcher.addEventListener('click', toggleChat);
    sendBtn.addEventListener('click', sendMessage);

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

    if (cfg.autoOpen) {
      setTimeout(toggleChat, cfg.autoOpenDelay || 3000);
    }
  }

  // ── Toggle chat open/close ────────────────────────────────────────────────
  function toggleChat() {
    isOpen = !isOpen;
    const launcher = shadow.getElementById('nova-launcher');
    const window_  = shadow.getElementById('nova-window');
    const dot      = shadow.getElementById('nova-dot');
    const messages = shadow.getElementById('nova-messages');
    const input    = shadow.getElementById('nova-input');

    launcher.classList.toggle('open', isOpen);
    window_.classList.toggle('open', isOpen);

    if (isOpen) {
      dot.style.display = 'none';
      if (messages.children.length === 0) {
        addMessage('bot', WELCOME_MSG);
      }
      setTimeout(() => input.focus(), 350);
    }
  }

  // ── Add message bubble ────────────────────────────────────────────────────
  function addMessage(role, text) {
    const messages = shadow.getElementById('nova-messages');
    const msg      = document.createElement('div');
    msg.className  = `nova-msg ${role}`;
    const avatar   = role === 'bot' ? '🤖' : '👤';
    msg.innerHTML  = `
      <div class="nova-msg-avatar">${avatar}</div>
      <div class="nova-bubble">${escapeHTML(text)}</div>`;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;

    // Show lead capture form after 3rd message if not already captured
    messageCount++;
    if (messageCount === 3 && !leadCaptured && BOT_ID !== 'demo') {
      showLeadForm();
    }
    return msg;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/\n/g,'<br>');
  }

  // ── Typing indicator ──────────────────────────────────────────────────────
  function showTyping() {
    isTyping = true;
    const typing = shadow.getElementById('nova-typing');
    const messages = shadow.getElementById('nova-messages');
    typing.classList.add('show');
    messages.scrollTop = messages.scrollHeight;
  }
  function hideTyping() {
    isTyping = false;
    shadow.getElementById('nova-typing').classList.remove('show');
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    const input   = shadow.getElementById('nova-input');
    const sendBtn = shadow.getElementById('nova-send');
    const text    = input.value.trim();
    if (!text || isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    addMessage('user', text);
    showTyping();

    try {
      const reply = await fetchBotReply(text);
      hideTyping();
      addMessage('bot', reply);
      // Only save to history when we get a real reply
      conversationHistory.push({ role: 'user', content: text });
      conversationHistory.push({ role: 'assistant', content: reply });
      if (conversationHistory.length > 10) {
        conversationHistory = conversationHistory.slice(-10);
      }
    } catch(err) {
      hideTyping();
      console.error('Nova AI error:', err.message);
      addMessage('bot', 'Sorry, I am having trouble connecting. Please try again.');
    }

    sendBtn.disabled = false;
    input.focus();
  }

  // ── Fetch reply from Groq via worker ─────────────────────────────────────
  async function fetchBotReply(userMessage) {

    // Build clean system prompt
    const systemPrompt = window._novaBotPrompt ||
      'You are a helpful and friendly AI assistant for ' + BOT_NAME + '. ' +
      'Help customers with questions about products, services, pricing and delivery. ' +
      'Be professional, warm and concise.';

    // Build clean messages — only valid history entries
    const cleanHistory = conversationHistory
      .filter(m => m.role && m.content && m.content.length > 0)
      .slice(-6);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: userMessage }
    ];

    const payload = {
      model:       'llama-3.3-70b-versatile',
      messages:    messages,
      max_tokens:  500,
      temperature: 0.7
    };

    const res = await fetch(API_BASE + '/groq', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Nova AI HTTP error:', res.status, errText);
      throw new Error('HTTP ' + res.status);
    }

    const data = await res.json();

    // Groq returns choices array
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content;
    }

    // Log unexpected format
    console.error('Nova AI: unexpected response:', JSON.stringify(data).slice(0, 300));

    // Try alternative formats
    if (data.reply) return data.reply;
    if (data.message) return data.message;
    if (data.error) throw new Error(data.error);

    throw new Error('No reply in response');
  }

  // ── Load bot system prompt from Supabase ──────────────────────────────────
  async function loadBotPrompt(botId) {
    if (botId === 'demo') return;
    try {
      const res  = await fetch(`${API_BASE}/api/bots/${botId}`);
      const data = await res.json();
      if (data.systemPrompt) {
        window._novaBotPrompt = data.systemPrompt;
      }
    } catch(e) {
      // Silent fail — default prompt will be used
    }
  }

  // ── Lead capture form ─────────────────────────────────────────────────────
  function showLeadForm() {
    const window_ = shadow.getElementById('nova-window');
    const existing = shadow.getElementById('nova-lead-form');
    if (existing) return;

    const form = document.createElement('div');
    form.id = 'nova-lead-form';
    form.innerHTML = `
      <p>Get updates and offers — drop your email:</p>
      <div id="nova-lead-form-row">
        <input type="email" id="nova-lead-email" placeholder="your@email.com"/>
        <button id="nova-lead-submit">Send</button>
      </div>
      <button id="nova-lead-dismiss">No thanks</button>`;

    // Insert before brand footer
    const brand = shadow.getElementById('nova-brand');
    window_.insertBefore(form, brand);

    shadow.getElementById('nova-lead-submit').addEventListener('click', submitLead);
    shadow.getElementById('nova-lead-dismiss').addEventListener('click', dismissLead);
  }

  async function submitLead() {
    const emailInput = shadow.getElementById('nova-lead-email');
    const email      = emailInput ? emailInput.value.trim() : '';
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      emailInput.style.borderColor = '#ef4444';
      return;
    }

    try {
      await fetch(`${API_BASE}/api/leads/capture`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, email, name: '' })
      });
    } catch(e) {
      // Silent fail — don't interrupt the chat
    }

    leadCaptured = true;
    sessionStorage.setItem('nova_lead_captured', 'true');
    dismissLead();
    addMessage('bot', 'Thank you! We will be in touch soon.');
  }

  function dismissLead() {
    const form = shadow.getElementById('nova-lead-form');
    if (form) form.remove();
    leadCaptured = true;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.NovaAI = {
    open:        () => { if (!isOpen) toggleChat(); },
    close:       () => { if (isOpen) toggleChat(); },
    toggle:      toggleChat,
    sendMessage: (msg) => {
      const input = shadow.getElementById('nova-input');
      if (isOpen && input) { input.value = msg; sendMessage(); }
    }
  };

  // ── Start ─────────────────────────────────────────────────────────────────
  initWidget();

})();
