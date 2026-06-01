export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/groq') {
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
        return new Response('OK - Worker is running', { status: 200 });
      }
      try {
        const body = await request.json();
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer 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'
          },
          body: JSON.stringify(body)
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch(e) {
        return new Response(JSON.stringify({error: e.message}), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
