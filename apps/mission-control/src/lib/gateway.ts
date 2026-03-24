const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

export async function invokeGateway(tool: string, args: object): Promise<unknown> {
  const res = await fetch(`${GATEWAY_URL}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`
    },
    body: JSON.stringify({ tool, args, requestId: Date.now().toString() })
  });
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.result.content[0].text);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
