// Netlify Function — MEDDPICC Copilot backend proxy
// API key stored in Netlify environment variables (never exposed to client)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'API key not configured on server' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  // Abort the upstream request before Netlify's 26s/30s wall so we return a real error
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 24000);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: body.system,
        messages: body.messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const text = await resp.text();

    if (!resp.ok) {
      // Surface the real upstream error instead of hanging
      let msg = text;
      try { msg = JSON.parse(text).error?.message || text; } catch (e) {}
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Anthropic API error: ' + msg }),
      };
    }

    console.log('USAGE', JSON.stringify({ workflow: body.workflow || 'unknown', ts: new Date().toISOString() }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (e) {
    clearTimeout(timeout);
    const msg = e.name === 'AbortError'
      ? 'Request to Anthropic timed out after 24s'
      : (e.message || String(e));
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: msg }),
    };
  }
};
