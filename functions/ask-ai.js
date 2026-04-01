export async function onRequestPost(context) {
  const apiKey = (context.env && context.env.HF_GEMINI_API_KEY_FROM_ENV ? context.env.HF_GEMINI_API_KEY_FROM_ENV : '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service configuration error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json();
    const contentsValid = Array.isArray(body && body.contents) && body.contents.every(
      item => item && typeof item === 'object' && typeof item.role === 'string' && Array.isArray(item.parts)
    );
    const generationConfigValid = body && (
      body.generationConfig === undefined ||
      (body.generationConfig && typeof body.generationConfig === 'object' && !Array.isArray(body.generationConfig))
    );
    if (!body || typeof body !== 'object' || !contentsValid || !generationConfigValid) {
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = { error: raw || 'Unexpected upstream response format.' };
    }
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ask-ai] proxy failure', error);
    return new Response(JSON.stringify({ error: 'Failed to proxy AI request.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
