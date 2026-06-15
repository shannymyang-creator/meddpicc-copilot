// Netlify Function — MEDDPICC Copilot backend proxy
// Uses Node's built-in https module (no fetch dependency, works on any Node version)

const https = require('https');

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

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: body.system,
    messages: body.messages,
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          timeout: 25000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }
      );

      req.on('error', (e) => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('Request to Anthropic timed out')); });

      req.write(payload);
      req.end();
    });

    if (result.status !== 200) {
      let msg = result.body;
      try { msg = JSON.parse(result.body).error?.message || result.body; } catch (e) {}
      return {
        statusCode: result.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Anthropic API error: ' + msg }),
      };
    }

    console.log('USAGE', JSON.stringify({ workflow: body.workflow || 'unknown', ts: new Date().toISOString() }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.body,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message || String(e) }),
    };
  }
};
