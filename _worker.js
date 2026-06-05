export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/groq') {

      // Handle CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response('OK - Nova AI Worker is running', { status: 200 });
      }

      // ── Check API key is configured ──────────────────────────
      if (!env.GROQ_API_KEY) {
        return new Response(JSON.stringify({
          error: 'GROQ_API_KEY not configured in Cloudflare environment variables'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      try {
        const body = await request.json();

        // ── Call Groq API using environment variable (secure) ──
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.GROQ_API_KEY}`  // ← secure, not hardcoded
          },
          body: JSON.stringify(body)
        });

        // ── Handle Groq rate limit errors ──────────────────────
        if (response.status === 429) {
          return new Response(JSON.stringify({
            error: 'Rate limit reached. Please wait a moment and try again.',
            code: 'RATE_LIMITED'
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        // ── Handle invalid API key ─────────────────────────────
        if (response.status === 401) {
          return new Response(JSON.stringify({
            error: 'Invalid API key. Please check your GROQ_API_KEY.',
            code: 'INVALID_KEY'
          }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        const data = await response.json();

        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });

      } catch(e) {
        return new Response(JSON.stringify({
          error: e.message,
          code: 'WORKER_ERROR'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // ── Serve all other pages normally ─────────────────────────
    return env.ASSETS.fetch(request);
  }
};
