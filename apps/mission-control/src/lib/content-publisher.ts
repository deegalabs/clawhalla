/**
 * Content Publisher — handles publishing to each social platform.
 *
 * Each platform has its own publish function that:
 * 1. Validates credentials from vault
 * 2. Uploads media if needed
 * 3. Creates the post via platform API
 * 4. Returns result with post URL/ID
 *
 * All functions require prior approval — this is enforced by the API layer.
 */

import { vault } from './vault';
import { type PlatformId, PLATFORM_ADAPTERS } from './platform-adapters';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PublishRequest {
  platform: PlatformId;
  text: string;
  hashtags?: string;
  mediaUrls?: string[];      // URLs to images/videos (local or external)
  format?: string;            // post | thread | carousel | reel | story | article
  thread?: string[];          // pre-split thread posts
  scheduledFor?: string;      // ISO date for scheduled publish
  metadata?: Record<string, unknown>;
}

export interface PublishResult {
  ok: boolean;
  platform: PlatformId;
  postId?: string;
  postUrl?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Main publish dispatcher                                            */
/* ------------------------------------------------------------------ */

export async function publishContent(req: PublishRequest): Promise<PublishResult> {
  const adapter = PLATFORM_ADAPTERS[req.platform];
  if (!adapter) {
    return { ok: false, platform: req.platform, error: `Unknown platform: ${req.platform}` };
  }

  // Check credentials
  const secret = await vault.get(adapter.secretKey);
  if (!secret?.value) {
    return {
      ok: false,
      platform: req.platform,
      error: `No ${adapter.secretKey} configured in vault. Add it in Settings.`,
    };
  }

  // Dispatch to platform-specific publisher
  switch (req.platform) {
    case 'linkedin':
      return publishLinkedIn(req, secret.value);
    case 'twitter':
      return publishTwitter(req, secret.value);
    case 'instagram':
      return publishInstagram(req, secret.value);
    case 'blog':
      return publishBlog(req, secret.value);
    case 'newsletter':
      return publishNewsletter(req, secret.value);
    default:
      return { ok: false, platform: req.platform, error: 'Platform publisher not implemented' };
  }
}

/* ------------------------------------------------------------------ */
/*  LinkedIn                                                           */
/* ------------------------------------------------------------------ */

async function publishLinkedIn(req: PublishRequest, token: string): Promise<PublishResult> {
  const API = 'https://api.linkedin.com/v2';

  try {
    // Get person URN
    const profileRes = await fetch(`${API}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) {
      return { ok: false, platform: 'linkedin', error: 'Failed to authenticate with LinkedIn. Token may be expired.' };
    }
    const profile = await profileRes.json();
    const personUrn = profile.sub;

    // Build post payload
    const adapted = PLATFORM_ADAPTERS.linkedin.adaptText(req.text, req.hashtags);
    const hasMedia = req.mediaUrls && req.mediaUrls.length > 0;

    if (hasMedia && req.mediaUrls!.length === 1) {
      // Single image post
      const mediaUrl = req.mediaUrls![0];
      const imageAsset = await uploadLinkedInImage(token, personUrn, mediaUrl);
      if (!imageAsset) {
        return { ok: false, platform: 'linkedin', error: 'Failed to upload image to LinkedIn' };
      }

      const postRes = await fetch(`${API}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${personUrn}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: adapted },
              shareMediaCategory: 'IMAGE',
              media: [{
                status: 'READY',
                media: imageAsset,
                title: { text: '' },
              }],
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });

      if (postRes.ok || postRes.status === 201) {
        const data = await postRes.json();
        return { ok: true, platform: 'linkedin', postId: data.id, postUrl: `https://www.linkedin.com/feed/update/${data.id}` };
      }
      const err = await postRes.text();
      return { ok: false, platform: 'linkedin', error: `LinkedIn API: ${postRes.status} — ${err}` };

    } else if (hasMedia && req.mediaUrls!.length > 1) {
      // Multi-image / carousel — upload all then post
      const assets: string[] = [];
      for (const url of req.mediaUrls!) {
        const asset = await uploadLinkedInImage(token, personUrn, url);
        if (asset) assets.push(asset);
      }

      const media = assets.map(asset => ({
        status: 'READY',
        media: asset,
        title: { text: '' },
      }));

      const postRes = await fetch(`${API}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${personUrn}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: adapted },
              shareMediaCategory: 'IMAGE',
              media,
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });

      if (postRes.ok || postRes.status === 201) {
        const data = await postRes.json();
        return { ok: true, platform: 'linkedin', postId: data.id, postUrl: `https://www.linkedin.com/feed/update/${data.id}` };
      }
      const err = await postRes.text();
      return { ok: false, platform: 'linkedin', error: `LinkedIn API: ${postRes.status} — ${err}` };

    } else {
      // Text-only post
      const postRes = await fetch(`${API}/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: `urn:li:person:${personUrn}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: adapted },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });

      if (postRes.ok || postRes.status === 201) {
        const data = await postRes.json();
        return { ok: true, platform: 'linkedin', postId: data.id, postUrl: `https://www.linkedin.com/feed/update/${data.id}` };
      }
      const err = await postRes.text();
      return { ok: false, platform: 'linkedin', error: `LinkedIn API: ${postRes.status} — ${err}` };
    }
  } catch (error) {
    return { ok: false, platform: 'linkedin', error: String(error) };
  }
}

/** Upload an image to LinkedIn and return the asset URN */
async function uploadLinkedInImage(token: string, personUrn: string, imageUrl: string): Promise<string | null> {
  const API = 'https://api.linkedin.com/v2';

  try {
    // 1. Register upload
    const registerRes = await fetch(`${API}/assets?action=registerUpload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: `urn:li:person:${personUrn}`,
          serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
        },
      }),
    });

    if (!registerRes.ok) return null;
    const regData = await registerRes.json();
    const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    const asset = regData.value?.asset;
    if (!uploadUrl || !asset) return null;

    // 2. Fetch the image
    let imageBuffer: Buffer;
    if (imageUrl.startsWith('/')) {
      // Local file
      const fs = await import('fs/promises');
      const path = await import('path');
      imageBuffer = await fs.readFile(path.join(process.cwd(), 'public', imageUrl));
    } else {
      const imgRes = await fetch(imageUrl);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    }

    // 3. Upload the image
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(imageBuffer),
    });

    if (uploadRes.ok || uploadRes.status === 201) {
      return asset;
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Twitter / X                                                        */
/* ------------------------------------------------------------------ */

async function publishTwitter(req: PublishRequest, apiKey: string): Promise<PublishResult> {
  // Twitter API v2 requires OAuth 1.0a or OAuth 2.0
  // The apiKey from vault should contain JSON: { apiKey, apiSecret, accessToken, accessSecret }
  try {
    let creds: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string };
    try {
      creds = JSON.parse(apiKey);
    } catch {
      return { ok: false, platform: 'twitter', error: 'TWITTER_API_KEY must be JSON with apiKey, apiSecret, accessToken, accessSecret' };
    }

    const adapted = PLATFORM_ADAPTERS.twitter.adaptText(req.text, req.hashtags);

    // Handle threads
    if (req.format === 'thread' && req.thread && req.thread.length > 1) {
      const postIds: string[] = [];
      let replyTo: string | undefined;

      for (const tweet of req.thread) {
        const result = await postTweet(creds, tweet, req.mediaUrls && postIds.length === 0 ? req.mediaUrls : undefined, replyTo);
        if (!result.ok) return { ok: false, platform: 'twitter', error: result.error };
        postIds.push(result.id!);
        replyTo = result.id;
      }

      return {
        ok: true,
        platform: 'twitter',
        postId: postIds[0],
        postUrl: `https://x.com/i/status/${postIds[0]}`,
        details: { threadIds: postIds },
      };
    }

    // Single tweet
    const result = await postTweet(creds, adapted, req.mediaUrls);
    if (!result.ok) return { ok: false, platform: 'twitter', error: result.error };

    return {
      ok: true,
      platform: 'twitter',
      postId: result.id,
      postUrl: `https://x.com/i/status/${result.id}`,
    };
  } catch (error) {
    return { ok: false, platform: 'twitter', error: String(error) };
  }
}

async function postTweet(
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string },
  text: string,
  mediaUrls?: string[],
  replyTo?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  // Twitter API v2 with OAuth 1.0a
  // For now, use simple Bearer token approach (API key as bearer)
  const payload: Record<string, unknown> = { text };
  if (replyTo) payload.reply = { in_reply_to_tweet_id: replyTo };

  // Upload media if present
  if (mediaUrls && mediaUrls.length > 0) {
    const mediaIds: string[] = [];
    for (const url of mediaUrls.slice(0, 4)) {
      const mediaId = await uploadTwitterMedia(creds, url);
      if (mediaId) mediaIds.push(mediaId);
    }
    if (mediaIds.length > 0) {
      payload.media = { media_ids: mediaIds };
    }
  }

  // OAuth 1.0a signature generation
  const { createHmac } = await import('crypto');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const baseUrl = 'https://api.x.com/2/tweets';
  const paramStr = Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const baseString = `POST&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramStr)}`;
  const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  const authHeader = 'OAuth ' + Object.entries(oauthParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');

  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const data = await res.json();
    return { ok: true, id: data.data?.id };
  }
  const err = await res.text();
  return { ok: false, error: `Twitter API ${res.status}: ${err}` };
}

async function uploadTwitterMedia(
  creds: { apiKey: string; apiSecret: string; accessToken: string; accessSecret: string },
  imageUrl: string,
): Promise<string | null> {
  // Twitter media upload uses v1.1 API
  try {
    let imageBuffer: Buffer;
    if (imageUrl.startsWith('/')) {
      const fs = await import('fs/promises');
      const path = await import('path');
      imageBuffer = await fs.readFile(path.join(process.cwd(), 'public', imageUrl));
    } else {
      const res = await fetch(imageUrl);
      imageBuffer = Buffer.from(await res.arrayBuffer());
    }

    const base64 = imageBuffer.toString('base64');
    const { createHmac } = await import('crypto');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, '');

    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: creds.apiKey,
      oauth_nonce: nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: timestamp,
      oauth_token: creds.accessToken,
      oauth_version: '1.0',
    };

    const paramStr = Object.entries(oauthParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const baseString = `POST&${encodeURIComponent(uploadUrl)}&${encodeURIComponent(paramStr)}`;
    const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
    const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');

    oauthParams.oauth_signature = signature;
    const authHeader = 'OAuth ' + Object.entries(oauthParams)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');

    const formData = new FormData();
    formData.append('media_data', base64);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return data.media_id_string;
    }
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Instagram                                                          */
/* ------------------------------------------------------------------ */

async function publishInstagram(req: PublishRequest, token: string): Promise<PublishResult> {
  // Instagram Graph API (requires Facebook Business account)
  // Token should contain JSON: { accessToken, igUserId }
  try {
    let creds: { accessToken: string; igUserId: string };
    try {
      creds = JSON.parse(token);
    } catch {
      return { ok: false, platform: 'instagram', error: 'INSTAGRAM_ACCESS_TOKEN must be JSON with accessToken and igUserId' };
    }

    const adapted = PLATFORM_ADAPTERS.instagram.adaptText(req.text, req.hashtags);
    const API = 'https://graph.facebook.com/v18.0';

    if (req.format === 'carousel' && req.mediaUrls && req.mediaUrls.length > 1) {
      // Carousel: create each item, then publish container
      const childIds: string[] = [];
      for (const url of req.mediaUrls.slice(0, 10)) {
        const isVideo = url.match(/\.(mp4|mov)$/i);
        const childRes = await fetch(`${API}/${creds.igUserId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(isVideo
              ? { media_type: 'VIDEO', video_url: url }
              : { image_url: url }),
            is_carousel_item: true,
            access_token: creds.accessToken,
          }),
        });
        if (childRes.ok) {
          const child = await childRes.json();
          childIds.push(child.id);
        }
      }

      // Create carousel container
      const containerRes = await fetch(`${API}/${creds.igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds,
          caption: adapted,
          access_token: creds.accessToken,
        }),
      });

      if (!containerRes.ok) {
        const err = await containerRes.text();
        return { ok: false, platform: 'instagram', error: `Instagram carousel container: ${err}` };
      }
      const container = await containerRes.json();

      // Publish
      const publishRes = await fetch(`${API}/${creds.igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: creds.accessToken,
        }),
      });

      if (publishRes.ok) {
        const pub = await publishRes.json();
        return { ok: true, platform: 'instagram', postId: pub.id, postUrl: `https://www.instagram.com/p/${pub.id}/` };
      }
      const err = await publishRes.text();
      return { ok: false, platform: 'instagram', error: `Instagram publish: ${err}` };

    } else if (req.mediaUrls && req.mediaUrls.length > 0) {
      // Single image/video post
      const url = req.mediaUrls[0];
      const isVideo = url.match(/\.(mp4|mov)$/i);

      const containerRes = await fetch(`${API}/${creds.igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isVideo
            ? { media_type: 'VIDEO', video_url: url }
            : { image_url: url }),
          caption: adapted,
          access_token: creds.accessToken,
        }),
      });

      if (!containerRes.ok) {
        const err = await containerRes.text();
        return { ok: false, platform: 'instagram', error: `Instagram container: ${err}` };
      }
      const container = await containerRes.json();

      // Wait for processing (Instagram needs time)
      await new Promise(r => setTimeout(r, 5000));

      const publishRes = await fetch(`${API}/${creds.igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: creds.accessToken,
        }),
      });

      if (publishRes.ok) {
        const pub = await publishRes.json();
        return { ok: true, platform: 'instagram', postId: pub.id };
      }
      const err = await publishRes.text();
      return { ok: false, platform: 'instagram', error: `Instagram publish: ${err}` };

    } else {
      return { ok: false, platform: 'instagram', error: 'Instagram requires at least one image or video' };
    }
  } catch (error) {
    return { ok: false, platform: 'instagram', error: String(error) };
  }
}

/* ------------------------------------------------------------------ */
/*  Blog (generic webhook / CMS API)                                   */
/* ------------------------------------------------------------------ */

async function publishBlog(req: PublishRequest, apiKey: string): Promise<PublishResult> {
  // Blog publishing via configurable webhook/API
  // apiKey should be JSON: { endpoint, token?, method? }
  try {
    let config: { endpoint: string; token?: string; method?: string };
    try {
      config = JSON.parse(apiKey);
    } catch {
      return { ok: false, platform: 'blog', error: 'BLOG_API_KEY must be JSON with endpoint (and optional token)' };
    }

    const adapted = PLATFORM_ADAPTERS.blog.adaptText(req.text, req.hashtags);

    const res = await fetch(config.endpoint, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        title: req.text.split('\n')[0]?.slice(0, 100) || 'New Post',
        content: adapted,
        status: 'publish',
        featured_media: req.mediaUrls?.[0] || null,
        tags: req.hashtags?.split(/[\s,]+/).filter(Boolean).map(t => t.replace('#', '')) || [],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { ok: true, platform: 'blog', postId: data.id?.toString(), postUrl: data.link || data.url };
    }
    const err = await res.text();
    return { ok: false, platform: 'blog', error: `Blog API ${res.status}: ${err}` };
  } catch (error) {
    return { ok: false, platform: 'blog', error: String(error) };
  }
}

/* ------------------------------------------------------------------ */
/*  Newsletter (SMTP / API)                                            */
/* ------------------------------------------------------------------ */

async function publishNewsletter(req: PublishRequest, apiKey: string): Promise<PublishResult> {
  // Newsletter via SMTP or API
  // apiKey should be JSON: { type: 'smtp' | 'api', endpoint?, ... }
  try {
    let config: { type: string; endpoint?: string; [key: string]: unknown };
    try {
      config = JSON.parse(apiKey);
    } catch {
      return { ok: false, platform: 'newsletter', error: 'NEWSLETTER_API_KEY must be JSON config' };
    }

    if (config.type === 'api' && config.endpoint) {
      const res = await fetch(config.endpoint as string, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        body: JSON.stringify({
          subject: req.text.split('\n')[0]?.slice(0, 100) || 'Newsletter',
          body: req.text,
          html: req.metadata?.html || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, platform: 'newsletter', postId: data.id?.toString() };
      }
      const err = await res.text();
      return { ok: false, platform: 'newsletter', error: `Newsletter API ${res.status}: ${err}` };
    }

    return { ok: false, platform: 'newsletter', error: 'Newsletter config type not supported. Use { type: "api", endpoint: "..." }' };
  } catch (error) {
    return { ok: false, platform: 'newsletter', error: String(error) };
  }
}

/* ------------------------------------------------------------------ */
/*  Check platform connection                                          */
/* ------------------------------------------------------------------ */

export async function checkPlatformConnection(platform: PlatformId): Promise<{ connected: boolean; error?: string; profile?: Record<string, unknown> }> {
  const adapter = PLATFORM_ADAPTERS[platform];
  if (!adapter) return { connected: false, error: 'Unknown platform' };

  const secret = await vault.get(adapter.secretKey);
  if (!secret?.value) return { connected: false, error: `No ${adapter.secretKey} in vault` };

  switch (platform) {
    case 'linkedin': {
      try {
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${secret.value}` },
        });
        if (res.ok) {
          const profile = await res.json();
          return { connected: true, profile: { name: profile.name, email: profile.email } };
        }
        return { connected: false, error: `LinkedIn returned ${res.status}` };
      } catch (e) {
        return { connected: false, error: String(e) };
      }
    }
    default:
      // For other platforms, just check if the key exists
      return { connected: true, profile: { note: 'Key configured but not validated' } };
  }
}
