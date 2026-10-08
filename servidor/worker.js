// Servidor do assistente do Treino Sob Medida (Cloudflare Worker).
// Guarda a chave do Gemini como segredo (GEMINI_KEY) e repassa as conversas do app,
// assim quem usa o app não precisa de chave nenhuma.

const ALLOWED_ORIGINS = ['https://andrearanttes99.github.io'];
// Tenta em ordem; se um modelo estiver aposentado, lotado ou no limite, passa para o próximo
const MODELS = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash'];
const NEXT_ON = [404, 429, 500, 503];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function reply(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === 'GET') return reply(200, { ok: true, servico: 'Treino Sob Medida' }, origin);
    if (request.method !== 'POST') return reply(405, { erro: 'metodo' }, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { erro: 'origem' }, origin);
    if (!env.GEMINI_KEY) return reply(500, { erro: 'sem_chave' }, origin);

    let data;
    try { data = await request.json(); } catch { return reply(400, { erro: 'json' }, origin); }
    const rules = String(data.rules || '').slice(0, 20000);
    const turns = (Array.isArray(data.turns) ? data.turns : []).slice(-14)
      .map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(t.content || '').slice(0, 6000) }] }))
      .filter(t => t.parts[0].text);
    if (!rules || !turns.length) return reply(400, { erro: 'vazio' }, origin);

    // O Gemini exige papéis alternados: junta mensagens seguidas do mesmo lado
    const contents = [];
    for (const t of turns) {
      const last = contents[contents.length - 1];
      if (last && last.role === t.role) last.parts[0].text += '\n\n' + t.parts[0].text;
      else contents.push(t);
    }

    const payload = JSON.stringify({
      systemInstruction: { parts: [{ text: rules }] },
      contents,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
    });
    let res;
    for (const model of [...new Set([env.MODEL, ...MODELS].filter(Boolean))]) {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: payload,
      });
      if (!NEXT_ON.includes(res.status)) break;
    }
    if (res.status === 429) return reply(429, { erro: 'limite' }, origin);
    if (!res.ok) {
      let detalhe = '';
      try { detalhe = String((await res.json())?.error?.message || '').slice(0, 300); } catch {}
      return reply(502, { erro: 'gemini', status: res.status, detalhe }, origin);
    }
    const body = await res.json();
    const text = (body?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) return reply(502, { erro: 'vazio_gemini' }, origin);
    return reply(200, { text }, origin);
  },
};
