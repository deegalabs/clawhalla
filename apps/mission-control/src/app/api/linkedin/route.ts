import { NextRequest, NextResponse } from 'next/server';
import { vault } from '@/lib/vault';

const LINKEDIN_API = 'https://api.linkedin.com';
const RESTLI_VERSION = '2.0.0';
const LINKEDIN_VERSION = '202401';
const REST_VERSION = '202506';

let cachedPersonUrn: string | null = null;

async function getToken(): Promise<string | null> {
  const secret = await vault.get('LINKEDIN_ACCESS_TOKEN');
  return secret?.value?.trim() || null;
}

async function getPersonUrn(token: string): Promise<string> {
  if (cachedPersonUrn) return cachedPersonUrn;

  const secret = await vault.get('LINKEDIN_PERSON_URN');
  if (secret?.value?.startsWith('urn:li:person:')) {
    cachedPersonUrn = secret.value;
    return cachedPersonUrn;
  }

  // Fallback: fetch from /v2/userinfo
  const res = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Cannot get person URN. Set LINKEDIN_PERSON_URN in Vault. LinkedIn returned ${res.status}`);
  }
  const data = await res.json();
  cachedPersonUrn = `urn:li:person:${data.sub}`;
  return cachedPersonUrn;
}

async function fetchLinkedIn(token: string, method: string, path: string, body?: unknown) {
  const url = path.startsWith('http') ? path : `${LINKEDIN_API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Restli-Protocol-Version': RESTLI_VERSION,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _raw: text }; }
  if (!res.ok) {
    const err = new Error((data.message || data.error || res.statusText || `HTTP ${res.status}`) as string);
    (err as unknown as Record<string, unknown>).status = res.status;
    (err as unknown as Record<string, unknown>).body = data;
    throw err;
  }
  return data;
}

// Initialize image upload via LinkedIn REST API
async function initializeImageUpload(token: string, personUrn: string) {
  const res = await fetch(`${LINKEDIN_API}/rest/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Restli-Protocol-Version': RESTLI_VERSION,
      'LinkedIn-Version': REST_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { _raw: raw }; }
  if (!res.ok) throw new Error(`Image upload init failed: ${res.status} ${raw}`);

  const value = (data.value || data) as Record<string, string>;
  if (!value.image || !value.uploadUrl) throw new Error('LinkedIn initializeUpload did not return image or uploadUrl');
  return { imageUrn: value.image, uploadUrl: value.uploadUrl };
}

// Upload image binary to LinkedIn
async function uploadImage(token: string, uploadUrl: string, imageBuffer: Buffer) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: imageBuffer as unknown as BodyInit,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image upload failed: ${res.status} ${text}`);
  }
}

// GET /api/linkedin — check connection status + profile
export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({
      ok: false, connected: false,
      error: 'No LINKEDIN_ACCESS_TOKEN in vault. Add it in Settings.',
    });
  }

  try {
    const res = await fetch(`${LINKEDIN_API}/v2/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const profile = await res.json();
      return NextResponse.json({
        ok: true, connected: true,
        profile: { name: profile.name, email: profile.email, sub: profile.sub },
      });
    }
    return NextResponse.json({
      ok: false, connected: false,
      error: `LinkedIn API returned ${res.status}. Token may be expired.`,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, connected: false, error: String(error) });
  }
}

/**
 * POST /api/linkedin — create a post on LinkedIn
 *
 * Body:
 *   text      (required) — post text, max 3000 chars
 *   url       (optional) — landing URL to attach (article link)
 *   imageUrl  (optional) — URL of image to upload and attach
 *   authorId  (optional) — person URN override
 */
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No LINKEDIN_ACCESS_TOKEN in vault' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, url: landingUrl, imageUrl } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
    }
    if (text.length > 3000) {
      return NextResponse.json({ ok: false, error: 'text exceeds 3000 character limit' }, { status: 400 });
    }

    const author = await getPersonUrn(token);

    // If imageUrl provided, upload to LinkedIn and use REST posts API
    let imageUrn: string | null = null;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      const imageRes = await fetch(imageUrl, { redirect: 'follow' });
      if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageRes.status}`);
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
      if (imageBuffer.length === 0) throw new Error('Image URL returned empty body');

      const init = await initializeImageUpload(token, author);
      await uploadImage(token, init.uploadUrl, imageBuffer);
      imageUrn = init.imageUrn;
    }

    let res: Response;
    if (imageUrn) {
      // REST API — post with image
      res = await fetch(`${LINKEDIN_API}/rest/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': RESTLI_VERSION,
          'LinkedIn-Version': REST_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author,
          commentary: text.trim(),
          visibility: 'PUBLIC',
          lifecycleState: 'PUBLISHED',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          content: { media: { id: imageUrn } },
        }),
      });
    } else {
      // UGC API — text post (with optional landing URL)
      const shareContent: Record<string, unknown> = {
        shareCommentary: { attributes: [], text: text.trim() },
        shareMediaCategory: 'NONE',
        media: [],
      };
      if (landingUrl && typeof landingUrl === 'string' && landingUrl.length <= 2000) {
        (shareContent as Record<string, unknown>).primaryLandingPageUrl = landingUrl.trim();
      }

      res = await fetch(`${LINKEDIN_API}/v2/ugcPosts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Restli-Protocol-Version': RESTLI_VERSION,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });
    }

    const postId = res.headers.get('x-restli-id');

    if (res.ok || res.status === 201) {
      return NextResponse.json({
        ok: true,
        postId,
        urn: postId ? (imageUrn ? `urn:li:share:${postId}` : `urn:li:ugcPost:${postId}`) : null,
        message: 'Post published successfully',
      });
    }

    const errorText = await res.text();
    let errorData: Record<string, unknown> = {};
    try { errorData = JSON.parse(errorText); } catch {}
    return NextResponse.json({
      ok: false,
      error: `LinkedIn API error: ${res.status}`,
      details: errorData,
    }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
