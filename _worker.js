// ============================================================
//  KUMSKID NOVA AI — Cloudflare Worker
//  Routes:
//  /groq                    → existing Groq AI proxy
//  /api/chat                → widget chat with client bot data
//  /api/payments/webhook    → Flutterwave payment webhook
//  /api/payments/verify     → verify payment after checkout
//  /api/bots/:botId         → get bot config for widget
//  everything else          → serve static pages
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PATCH, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function optionsResponse() {
  return new Response(null, { status: 204, headers: CORS });
}

async function supabase(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...options.headers
    }
  });
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return optionsResponse();

    // ══════════════════════════════════════════════════════
    // ROUTE 1: /groq — existing Groq proxy (unchanged)
    // ══════════════════════════════════════════════════════
    if (path === '/groq') {
      if (method !== 'POST') {
        return new Response('OK - Nova AI Worker is running', { status: 200 });
      }
      if (!env.GROQ_API_KEY) {
        return corsResponse({ error: 'GROQ_API_KEY not configured' }, 500);
      }
      try {
        const body     = await request.json();
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`
          },
          body: JSON.stringify(body)
        });
        if (response.status === 429) {
          return corsResponse({ error: 'Rate limit reached. Please wait.', code: 'RATE_LIMITED' }, 429);
        }
        if (response.status === 401) {
          return corsResponse({ error: 'Invalid API key.', code: 'INVALID_KEY' }, 401);
        }
        const data = await response.json();
        return corsResponse(data);
      } catch(e) {
        return corsResponse({ error: e.message, code: 'WORKER_ERROR' }, 500);
      }
    }

    // ══════════════════════════════════════════════════════
    // ROUTE 2: /api/bots/:botId — get bot config for widget
    // ══════════════════════════════════════════════════════
    if (path.startsWith('/api/bots/') && method === 'GET') {
      const botId = path.replace('/api/bots/', '');
      if (!botId) return corsResponse({ error: 'Bot ID required' }, 400);
      try {
        const bots = await supabase(env, `chatbots?id=eq.${botId}&select=*`);
        if (!bots.length) return corsResponse({ error: 'Bot not found' }, 404);
        const bot = bots[0];
        if (!bot.is_active) {
          return corsResponse({ error: 'Bot inactive. Subscription may have expired.', code: 'BOT_INACTIVE' }, 403);
        }
        // Also fetch knowledge base and combine with system prompt
        let fullSystemPrompt = bot.system_prompt || 'You are a helpful AI assistant.';
        try {
          const knowledge = await supabase(env,
            `knowledge_bases?chatbot_id=eq.${botId}&select=content_raw,title`
          );
          if (knowledge.length > 0) {
            const kb = knowledge.map(k => `[${k.title || 'Info'}]: ${k.content_raw}`).join('\n\n');
            fullSystemPrompt += '\n\nBUSINESS KNOWLEDGE:\n' + kb;
          }
        } catch(kbErr) {
          console.error('KB fetch error:', kbErr.message);
        }

        return corsResponse({
          botId:          bot.id,
          botName:        bot.bot_name,
          welcomeMessage: bot.welcome_message,
          primaryColor:   bot.primary_color,
          accentColor:    bot.accent_color,
          theme:          bot.theme,
          systemPrompt:   fullSystemPrompt,
          isActive:       bot.is_active
        });
      } catch(e) {
        return corsResponse({ error: e.message }, 500);
      }
    }

    // ══════════════════════════════════════════════════════
    // ROUTE 3: /api/chat — main widget chat handler
    // ══════════════════════════════════════════════════════
    if (path === '/api/chat' && method === 'POST') {
      if (!env.GROQ_API_KEY) {
        return corsResponse({ reply: 'AI service not configured. Please contact support.' }, 500);
      }

      try {
        const body = await request.json();
        const { botId, message, sessionId, history = [] } = body;

        if (!botId || !message) {
          return corsResponse({ reply: 'Missing botId or message.' }, 400);
        }

        // ── Try to fetch bot config from Supabase ──────────
        let systemPrompt = 'You are a helpful and friendly AI assistant. Answer customer questions professionally and helpfully.';
        let botActive    = true;

        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
          try {
            const bots = await supabase(env, `chatbots?id=eq.${botId}&select=*`);
            if (bots.length > 0) {
              const bot = bots[0];
              botActive    = bot.is_active !== false;
              systemPrompt = bot.system_prompt || systemPrompt;

              // Fetch knowledge base
              const knowledge = await supabase(env,
                `knowledge_bases?chatbot_id=eq.${botId}&select=content_raw,title`
              );
              if (knowledge.length > 0) {
                const kb = knowledge.map(k => `[${k.title || 'Info'}]: ${k.content_raw}`).join('\n\n');
                systemPrompt += '\n\nBUSINESS KNOWLEDGE:\n' + kb;
              }
            }
          } catch(dbErr) {
            // DB fetch failed — continue with default prompt
            console.error('DB fetch error:', dbErr.message);
          }
        }

        if (!botActive) {
          return corsResponse({ reply: 'This assistant is currently unavailable. Please contact the website owner.' });
        }

        // ── Build messages ─────────────────────────────────
        const messages = [
          {
            role: 'system',
            content: systemPrompt + '\n\nIMPORTANT: Be helpful, friendly and professional. Keep responses concise.'
          },
          ...history.slice(-8),
          { role: 'user', content: message }
        ];

        // ── Call Groq ──────────────────────────────────────
        const startTime = Date.now();
        const groqRes   = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model:       'llama3-8b-8192',
            messages:    messages,
            max_tokens:  500,
            temperature: 0.7
          })
        });

        if (groqRes.status === 429) {
          return corsResponse({ reply: 'I am a little busy right now. Please try again in a moment.' });
        }

        if (groqRes.status === 401) {
          return corsResponse({ reply: 'AI service authentication failed. Please contact support.' });
        }

        const groqData   = await groqRes.json();
        const reply      = groqData.choices?.[0]?.message?.content;

        if (!reply) {
          // Log what Groq returned for debugging
          console.error('Groq returned no reply:', JSON.stringify(groqData));
          return corsResponse({ reply: 'I received your message but could not generate a response. Please try again.' });
        }

        const tokensUsed = groqData.usage?.total_tokens || 0;
        const responseMs = Date.now() - startTime;

        // ── Save to Supabase (non-blocking) ────────────────
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && sessionId) {
          (async () => {
            try {
              let conversationId = null;
              const existing = await supabase(env,
                `conversations?session_token=eq.${sessionId}&select=id`
              );
              if (existing.length > 0) {
                conversationId = existing[0].id;
              } else {
                const newConv = await supabase(env, 'conversations', {
                  method: 'POST',
                  body: JSON.stringify({
                    chatbot_id:    botId,
                    session_token: sessionId,
                    page_url:      request.headers.get('Referer') || ''
                  })
                });
                conversationId = Array.isArray(newConv) ? newConv[0]?.id : newConv?.id;
              }
              if (conversationId) {
                await supabase(env, 'messages', {
                  method: 'POST',
                  body: JSON.stringify({
                    conversation_id: conversationId,
                    sender_type:     'user',
                    message_text:    message,
                    tokens_used:     0
                  })
                });
                await supabase(env, 'messages', {
                  method: 'POST',
                  body: JSON.stringify({
                    conversation_id: conversationId,
                    sender_type:     'bot',
                    message_text:    reply,
                    tokens_used:     tokensUsed,
                    response_time_ms: responseMs
                  })
                });
              }
            } catch(saveErr) {
              console.error('Save conversation error:', saveErr.message);
            }
          })();
        }

        return corsResponse({ reply, tokensUsed, responseMs });

      } catch(e) {
        console.error('Chat route error:', e.message);
        return corsResponse({
          reply: 'Sorry, I am having trouble right now. Please try again in a moment.'
        }, 500);
      }
    }

    // ══════════════════════════════════════════════════════
    // ROUTE 4: /api/payments/webhook — Flutterwave webhook
    // ══════════════════════════════════════════════════════
    if (path === '/api/payments/webhook' && method === 'POST') {
      try {
        const signature = request.headers.get('verif-hash');
        if (signature !== env.FLW_WEBHOOK_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
        const event = await request.json();
        if (event.event === 'charge.completed' && event.data.status === 'successful') {
          const txData   = event.data;
          const email    = txData.customer?.email;
          const planSlug = txData.meta?.plan_slug || 'starter';
          if (email) {
            const users = await supabase(env, `users?email=eq.${email}&select=id`);
            if (users.length > 0) {
              const userId    = users[0].id;
              const now       = new Date();
              const periodEnd = new Date(now);
              periodEnd.setMonth(periodEnd.getMonth() + 1);
              await supabase(env, `subscriptions?user_id=eq.${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  plan_tier:            planSlug,
                  status:               'active',
                  payment_gateway:      'flutterwave',
                  gateway_sub_id:       String(txData.id),
                  gateway_customer_id:  email,
                  current_period_start: now.toISOString(),
                  current_period_end:   periodEnd.toISOString(),
                  cancel_at_period_end: false,
                  updated_at:           now.toISOString()
                })
              });
              await supabase(env, `chatbots?user_id=eq.${userId}`, {
                method: 'PATCH',
                body: JSON.stringify({ is_active: true })
              });
            }
          }
        }
        return new Response('OK', { status: 200 });
      } catch(e) {
        return new Response('Webhook error: ' + e.message, { status: 500 });
      }
    }

    // ══════════════════════════════════════════════════════
    // ROUTE 5: /api/payments/verify — verify payment
    // ══════════════════════════════════════════════════════
    if (path === '/api/payments/verify' && method === 'POST') {
      try {
        const { transactionId, planSlug, userEmail } = await request.json();
        if (!transactionId || !userEmail) {
          return corsResponse({ error: 'transactionId and userEmail required' }, 400);
        }
        const flwRes = await fetch(
          `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
          { headers: { 'Authorization': `Bearer ${env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' } }
        );
        const flwData = await flwRes.json();
        if (flwData.data?.status !== 'successful') {
          return corsResponse({ success: false, error: 'Payment not verified' }, 400);
        }
        const users = await supabase(env, `users?email=eq.${userEmail}&select=id`);
        if (users.length > 0) {
          const userId    = users[0].id;
          const now       = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          await supabase(env, `subscriptions?user_id=eq.${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              plan_tier:            planSlug || 'starter',
              status:               'active',
              payment_gateway:      'flutterwave',
              gateway_sub_id:       String(transactionId),
              current_period_start: now.toISOString(),
              current_period_end:   periodEnd.toISOString(),
              updated_at:           now.toISOString()
            })
          });
          await supabase(env, `chatbots?user_id=eq.${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: true })
          });
        }
        return corsResponse({ success: true, message: 'Subscription activated' });
      } catch(e) {
        return corsResponse({ error: e.message }, 500);
      }
    }

    // ══════════════════════════════════════════════════════
    // ROUTE 6: /api/leads/capture — capture visitor email
    // ══════════════════════════════════════════════════════
    if (path === '/api/leads/capture' && method === 'POST') {
      try {
        const { sessionId, email, name } = await request.json();
        if (!sessionId || !email) {
          return corsResponse({ error: 'sessionId and email required' }, 400);
        }
        await supabase(env, `conversations?session_token=eq.${sessionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ visitor_email: email, visitor_name: name || '' })
        });
        return corsResponse({ success: true, message: 'Lead captured' });
      } catch(e) {
        return corsResponse({ error: e.message }, 500);
      }
    }

    // ══════════════════════════════════════════════════════
    // DEFAULT: serve all static pages normally
    // ══════════════════════════════════════════════════════
    return env.ASSETS.fetch(request);
  }
};
