// Бесплатный посредник между приложением «Дела» и Google Gemini.
// Разворачивается на Cloudflare Workers. Ключ Gemini — в секрете GEMINI_KEY или в константе ниже
// (только в копии кода на Cloudflare: в репозиторий ключ не попадает).
//
// Запрос:  POST { system: "...", messages: [{ role: "user" | "assistant", content: "..." }], json?: true }
// Ответ:   { text: "..." }  или  { error: "..." }

const GEMINI_KEY = '';
const ALLOWED_ORIGINS = ['https://mura077-aze.github.io'];
// Первая — основная, остальные — запасные (если основная перегружена или недоступна).
// think: модель понимает thinkingLevel; 'minimal' — быстрые ответы в чате
const MODELS = [
  { id: 'gemini-3.5-flash', think: true },
  { id: 'gemini-flash-lite-latest', think: true },
  { id: 'gemini-flash-latest', think: false },
];
const MAX_BODY = 200_000;

// Простое ограничение: не больше 20 запросов в минуту с одного адреса
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 20;
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

const reply = (data, status, origin) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

export default {
  async fetch(request, env) {
    const key = env.GEMINI_KEY || GEMINI_KEY;
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (request.method !== 'POST') return reply({ error: 'POST only' }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: 'origin not allowed' }, 403, origin);
    if (!key) return reply({ error: 'GEMINI_KEY is not set' }, 500, origin);
    if (tooMany(request.headers.get('CF-Connecting-IP') || 'x')) return reply({ error: 'rate limited' }, 429, origin);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply({ error: 'too large' }, 413, origin);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({ error: 'bad json' }, 400, origin); }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return reply({ error: 'no messages' }, 400, origin);

    const payload = {
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content || '') }],
      })),
      generationConfig: { temperature: 0.9, maxOutputTokens: 8192, ...(body.json ? { responseMimeType: 'application/json' } : {}) },
    };
    if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system) }] };

    let last = '';
    for (const { id: model, think } of MODELS) {
      const generationConfig = think
        ? { ...payload.generationConfig, thinkingConfig: { thinkingLevel: body.json ? 'low' : 'minimal' } }
        : payload.generationConfig;
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ ...payload, generationConfig }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
        if (text) return reply({ text, model }, 200, origin);
        last = 'empty answer';
        continue;
      }
      last = data.error?.message || `HTTP ${r.status}`;
      // Модель недоступна, перегружена или исчерпан её лимит — пробуем запасную
      if ([404, 429, 500, 503].includes(r.status) || (r.status === 400 && /thinking/i.test(last))) continue;
      return reply({ error: last }, r.status, origin);
    }
    return reply({ error: last || 'no model answered' }, 429, origin);
  },
};
