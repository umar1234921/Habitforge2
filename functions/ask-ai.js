export async function onRequestPost(context) {
  const apiKey = (context.env && context.env.HF_GEMINI_API_KEY_FROM_ENV ? context.env.HF_GEMINI_API_KEY_FROM_ENV : '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing HF_GEMINI_API_KEY_FROM_ENV secret.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to proxy AI request.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
