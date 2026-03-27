import { getSetting } from './settings';

function getGatewayUrl(): string {
  return getSetting('gateway_url', process.env.GATEWAY_URL || 'http://127.0.0.1:18789');
}

function getGatewayToken(): string {
  return getSetting('gateway_token', process.env.GATEWAY_TOKEN || '');
}

export async function invokeGateway(tool: string, args: object): Promise<unknown> {
  const url = getGatewayUrl();
  const token = getGatewayToken();
  const res = await fetch(`${url}/tools/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ tool, args, requestId: Date.now().toString() }),
  });
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.result.content[0].text);
}

export async function healthCheck(): Promise<boolean> {
  try {
    const url = getGatewayUrl();
    const res = await fetch(`${url}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
