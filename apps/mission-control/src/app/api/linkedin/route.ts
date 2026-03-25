import { NextResponse } from 'next/server';
import { vault } from '@/lib/vault';

const LINKEDIN_API = 'https://api.linkedin.com/v2';

async function getLinkedInToken(): Promise<string | null> {
  try {
    const secret = await vault.get('LINKEDIN_ACCESS_TOKEN');
    return secret?.value || null;
  } catch {
    return null;
  }
}

// GET /api/linkedin — check connection status
export async function GET() {
  const token = await getLinkedInToken();
  if (!token) {
    return NextResponse.json({
      ok: false,
      connected: false,
      error: 'No LINKEDIN_ACCESS_TOKEN in vault. Add it in Settings.',
    });
  }

  try {
    const res = await fetch(`${LINKEDIN_API}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const profile = await res.json();
      return NextResponse.json({
        ok: true,
        connected: true,
        profile: {
          name: profile.name,
          email: profile.email,
          sub: profile.sub,
        },
      });
    }

    return NextResponse.json({
      ok: false,
      connected: false,
      error: `LinkedIn API returned ${res.status}. Token may be expired.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LinkedIn connection failed';
    return NextResponse.json({ ok: false, connected: false, error: message });
  }
}

// POST /api/linkedin — create a post
export async function POST(req: Request) {
  const token = await getLinkedInToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: 'No LINKEDIN_ACCESS_TOKEN in vault' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, authorId } = body;

    if (!text) {
      return NextResponse.json({ ok: false, error: 'text is required' }, { status: 400 });
    }

    // Get author URN (person ID)
    let personUrn = authorId;
    if (!personUrn) {
      const profileRes = await fetch(`${LINKEDIN_API}/userinfo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profileRes.ok) {
        return NextResponse.json({ ok: false, error: 'Failed to get LinkedIn profile' }, { status: 401 });
      }
      const profile = await profileRes.json();
      personUrn = profile.sub;
    }

    // Create ugcPost
    const postRes = await fetch(`${LINKEDIN_API}/ugcPosts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: `urn:li:person:${personUrn}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }),
    });

    if (postRes.ok || postRes.status === 201) {
      const postData = await postRes.json();
      return NextResponse.json({
        ok: true,
        postId: postData.id,
        message: 'Post published successfully',
      });
    }

    const errorData = await postRes.text();
    return NextResponse.json({ ok: false, error: `LinkedIn API error: ${postRes.status} — ${errorData}` }, { status: 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to post to LinkedIn';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
