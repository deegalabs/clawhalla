import { NextRequest, NextResponse } from 'next/server';
import { vault } from '@/lib/vault';
import { authenticateRequest, isAuthError } from '@/lib/auth';

// GET /api/vault/credentials?provider=anthropic
// Returns decrypted LLM provider credentials for gateway use.
// Only accessible by authenticated gateway requests (bearer token).
//
// This is the GAP 1 FIX: the gateway no longer reads auth-profiles.json.
// Instead it calls this endpoint to get credentials at runtime.
// Secrets never touch the disk — they live encrypted in MC's SQLite vault.
//
// Expected vault secret names:
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, etc.
//   Or token-based: ANTHROPIC_OAUTH_TOKEN
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Only gateway can fetch raw credentials
  if (auth.type === 'agent') {
    return NextResponse.json(
      { ok: false, error: 'Agents cannot access raw credentials. Use /api/vault/reveal for masked values.' },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get('provider');

  if (!provider) {
    return NextResponse.json({ ok: false, error: 'provider parameter required' }, { status: 400 });
  }

  const providerUpper = provider.toUpperCase();

  // Try API key first, then OAuth token
  const keyNames = [
    `${providerUpper}_API_KEY`,
    `${providerUpper}_OAUTH_TOKEN`,
    `${providerUpper}_TOKEN`,
  ];

  for (const keyName of keyNames) {
    const secret = await vault.get(keyName);
    if (secret) {
      const isToken = keyName.includes('TOKEN');

      console.log(`[vault-credentials] Gateway fetched ${keyName} for provider ${provider}`);

      return NextResponse.json({
        ok: true,
        provider,
        type: isToken ? 'token' : 'api_key',
        key: secret.value,
        name: keyName,
      });
    }
  }

  return NextResponse.json(
    { ok: false, error: `No credentials found for provider: ${provider}` },
    { status: 404 }
  );
}
