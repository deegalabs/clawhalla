import { NextResponse } from 'next/server';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

export async function GET() {
  try {
    // Call the cron list endpoint directly
    const res = await fetch(`${GATEWAY_URL}/cron/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      },
      cache: 'no-store',
    });
    
    if (!res.ok) {
      // Fallback: try tools/invoke
      const toolRes = await fetch(`${GATEWAY_URL}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        },
        body: JSON.stringify({ tool: 'cron', args: { action: 'list' } }),
        cache: 'no-store',
      });
      
      const toolData = await toolRes.json();
      if (toolData.ok) {
        const text = toolData.result?.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : { jobs: [] };
        return NextResponse.json({ ok: true, crons: parsed.jobs || parsed || [] });
      }
      
      throw new Error('Failed to fetch crons');
    }
    
    const data = await res.json();
    return NextResponse.json({ ok: true, crons: data.jobs || data || [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    
    // Return fallback hardcoded data when gateway fails
    const fallbackCrons = [
      { id: '1', name: 'Frigg Morning Brief', agentId: 'frigg', schedule: { kind: 'cron', expr: '3 10 * * 1-5' }, enabled: true },
      { id: '2', name: 'Frigg EOD Summary', agentId: 'frigg', schedule: { kind: 'cron', expr: '47 20 * * 1-5' }, enabled: true },
      { id: '3', name: 'Mimir Research Digest', agentId: 'mimir', schedule: { kind: 'cron', expr: '13 21 * * *' }, enabled: true },
      { id: '4', name: 'Loki Weekly Brief', agentId: 'loki', schedule: { kind: 'cron', expr: '17 12 * * 5' }, enabled: true },
      { id: '5', name: 'Claw Memory Maintenance', agentId: 'main', schedule: { kind: 'cron', expr: '43 2 * * *' }, enabled: true },
      { id: '6', name: 'Bragi Daily Post Draft', agentId: 'bragi', schedule: { kind: 'cron', expr: '30 13 * * *' }, enabled: true },
      { id: '7', name: 'LinkedIn Comments Monitor', agentId: 'bragi', schedule: { kind: 'cron', expr: '0 */6 * * *' }, enabled: true },
      { id: '8', name: 'Claw Weekly Memory Review', agentId: 'main', schedule: { kind: 'cron', expr: '0 14 * * 0' }, enabled: true },
    ];
    
    return NextResponse.json({ 
      ok: false, 
      error: message,
      crons: fallbackCrons,
      source: 'fallback'
    });
  }
}
