// Servidor do assistente do Treino Sob Medida (Cloudflare Worker).
// Guarda a chave do Gemini como segredo (GEMINI_KEY) e repassa as conversas do app,
// assim quem usa o app não precisa de chave nenhuma.
// Também guarda o backup dos dados do app (rota /dados) num KV ligado como DADOS.

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

// Backup: cada app tem um código de 12 letras/números; quem tem o código lê e grava os dados
async function dados(data, env, origin) {
  if (!env.DADOS) return reply(501, { erro: 'sem_kv' }, origin);
  const codigo = String(data.codigo || '');
  if (!/^[A-Z2-9]{12}$/.test(codigo)) return reply(400, { erro: 'codigo' }, origin);
  if (data.acao === 'ler') {
    const salvo = await env.DADOS.get('d:' + codigo, 'json');
    return reply(200, { dados: salvo?.dados || null, fotosTs: salvo?.fotosTs || 0 }, origin);
  }
  if (data.acao === 'ler_fotos') {
    return reply(200, { fotos: (await env.DADOS.get('f:' + codigo, 'json')) || [] }, origin);
  }
  if (data.acao === 'salvar') {
    if (!data.dados || !Array.isArray(data.dados.profiles)) return reply(400, { erro: 'vazio' }, origin);
    const antes = await env.DADOS.get('d:' + codigo, 'json');
    let fotosTs = antes?.fotosTs || 0;
    if (Array.isArray(data.fotos)) {
      fotosTs = Date.now();
      await env.DADOS.put('f:' + codigo, JSON.stringify(data.fotos));
    }
    await env.DADOS.put('d:' + codigo, JSON.stringify({ dados: data.dados, fotosTs }));
    return reply(200, { ok: true, fotosTs }, origin);
  }
  return reply(400, { erro: 'acao' }, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method === 'GET') return reply(200, { ok: true, servico: 'Treino Sob Medida' }, origin);
    if (request.method !== 'POST') return reply(405, { erro: 'metodo' }, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { erro: 'origem' }, origin);

    let data;
    try { data = await request.json(); } catch { return reply(400, { erro: 'json' }, origin); }
    if (new URL(request.url).pathname === '/dados') return dados(data, env, origin);
    if (!env.GEMINI_KEY) return reply(500, { erro: 'sem_chave' }, origin);

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
