import { ROUTER_API_KEY, ROUTER_BASE_URL, ROUTER_MODEL } from './config.js';

export async function call9Router({ system, user, agentId }) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (ROUTER_API_KEY) headers.Authorization = `Bearer ${ROUTER_API_KEY}`;

  const response = await fetch(`${ROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: ROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`9router ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? 'Sem resposta textual do modelo.';
}
