import { NextResponse } from 'next/server';
import { vault } from '@/lib/vault';

// POST /api/vault/inject — resolve secret references in agent context
// Agent sends: { text: "Use $LINKEDIN_ACCESS_TOKEN to post" }
// MC returns: { text: "Use sk-xxx...yyy to post", injected: ["LINKEDIN_ACCESS_TOKEN"] }
// This allows agents to USE secrets without SEEING the raw vault
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, agentId } = body;

    if (!text) {
      return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
    }

    // Find all $SECRET_NAME references
    const secretPattern = /\$([A-Z][A-Z0-9_]*)/g;
    const matches = [...text.matchAll(secretPattern)];

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, text, injected: [], resolved: 0 });
    }

    let resolvedText = text;
    const injected: string[] = [];
    const failed: string[] = [];

    for (const match of matches) {
      const secretName = match[1];
      try {
        const secret = await vault.get(secretName);
        if (secret) {
          resolvedText = resolvedText.replace(`$${secretName}`, secret.value);
          injected.push(secretName);
        } else {
          failed.push(secretName);
        }
      } catch {
        failed.push(secretName);
      }
    }

    // Log the injection (without the values)
    if (injected.length > 0) {
      console.log(`[vault-inject] Agent ${agentId || 'unknown'} resolved: ${injected.join(', ')}`);
    }

    return NextResponse.json({
      ok: true,
      text: resolvedText,
      injected,
      failed,
      resolved: injected.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Injection failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
