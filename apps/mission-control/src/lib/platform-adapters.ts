/**
 * Platform Adapters — format rules, limits, and content adaptation per social network.
 *
 * Each adapter defines: character limits, media rules, supported formats,
 * and how to transform content for that platform's publishing API.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PlatformId = 'linkedin' | 'twitter' | 'instagram' | 'blog' | 'newsletter';

export type ContentFormat = 'post' | 'thread' | 'carousel' | 'reel' | 'story' | 'article';

export interface MediaRule {
  maxImages: number;
  maxVideoSeconds: number;
  maxFileSizeMB: number;
  supportedImageTypes: string[];
  supportedVideoTypes: string[];
  imageAspectRatios?: string[];  // e.g. '1:1', '4:5', '16:9'
  maxImageWidth?: number;
  maxImageHeight?: number;
  thumbnailRequired?: boolean;
}

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  emoji: string;
  color: string;
  secretKey: string;               // vault key for API credentials

  /* Text limits */
  maxChars: number;
  hashtagLimit: number;
  supportsMarkdown: boolean;
  supportsHtml: boolean;

  /* Supported formats */
  formats: ContentFormat[];

  /* Media rules */
  media: MediaRule;

  /* Format-specific adapters */
  adaptText: (text: string, hashtags?: string) => string;
  splitThread?: (text: string) => string[];   // for thread-based platforms
  buildCarousel?: (slides: CarouselSlide[]) => CarouselPayload;
}

export interface CarouselSlide {
  imageUrl: string;
  caption?: string;
  alt?: string;
}

export interface CarouselPayload {
  slides: CarouselSlide[];
  coverCaption: string;
}

export interface ContentPackage {
  platform: PlatformId;
  format: ContentFormat;
  text: string;
  hashtags: string;
  mediaUrls: string[];
  thread?: string[];        // split text for threads
  carousel?: CarouselPayload;
  metadata: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).trimEnd() + '...';
}

function appendHashtags(text: string, hashtags: string | undefined, maxChars: number): string {
  if (!hashtags) return text;
  const tags = hashtags.split(/[\s,]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`);
  const tagStr = tags.join(' ');
  const combined = `${text}\n\n${tagStr}`;
  if (combined.length <= maxChars) return combined;
  // Trim tags to fit
  let result = text;
  for (const tag of tags) {
    const next = result + (result === text ? '\n\n' : ' ') + tag;
    if (next.length > maxChars) break;
    result = next;
  }
  return result;
}

function splitIntoThread(text: string, maxPerPost: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const posts: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current && (current + '\n\n' + para).length > maxPerPost - 6) { // -6 for " (x/y)"
      posts.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) posts.push(current.trim());

  // If single post is still too long, hard-split
  const result: string[] = [];
  for (const post of posts) {
    if (post.length <= maxPerPost - 6) {
      result.push(post);
    } else {
      // Split at sentence boundaries
      const sentences = post.match(/[^.!?]+[.!?]+/g) || [post];
      let chunk = '';
      for (const s of sentences) {
        if ((chunk + s).length > maxPerPost - 6) {
          if (chunk) result.push(chunk.trim());
          chunk = s;
        } else {
          chunk += s;
        }
      }
      if (chunk.trim()) result.push(chunk.trim());
    }
  }

  // Number them
  if (result.length > 1) {
    return result.map((p, i) => `${p} (${i + 1}/${result.length})`);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Platform Adapters                                                  */
/* ------------------------------------------------------------------ */

export const PLATFORM_ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  linkedin: {
    id: 'linkedin',
    label: 'LinkedIn',
    emoji: '💼',
    color: 'bg-blue-600',
    secretKey: 'LINKEDIN_ACCESS_TOKEN',
    maxChars: 3000,
    hashtagLimit: 7,
    supportsMarkdown: false,
    supportsHtml: false,
    formats: ['post', 'article', 'carousel'],
    media: {
      maxImages: 9,
      maxVideoSeconds: 600,
      maxFileSizeMB: 200,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
      supportedVideoTypes: ['video/mp4'],
      imageAspectRatios: ['1:1', '1.91:1', '4:5'],
      maxImageWidth: 4096,
      maxImageHeight: 4096,
    },
    adaptText: (text, hashtags) => appendHashtags(truncate(text, 3000), hashtags, 3000),
    buildCarousel: (slides) => ({
      slides,
      coverCaption: slides[0]?.caption || '',
    }),
  },

  twitter: {
    id: 'twitter',
    label: 'Twitter / X',
    emoji: '𝕏',
    color: 'bg-gray-700',
    secretKey: 'TWITTER_API_KEY',
    maxChars: 280,
    hashtagLimit: 2,
    supportsMarkdown: false,
    supportsHtml: false,
    formats: ['post', 'thread'],
    media: {
      maxImages: 4,
      maxVideoSeconds: 140,
      maxFileSizeMB: 512,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      supportedVideoTypes: ['video/mp4'],
      imageAspectRatios: ['16:9', '1:1'],
      maxImageWidth: 4096,
      maxImageHeight: 4096,
    },
    adaptText: (text, hashtags) => appendHashtags(truncate(text, 280), hashtags, 280),
    splitThread: (text) => splitIntoThread(text, 280),
  },

  instagram: {
    id: 'instagram',
    label: 'Instagram',
    emoji: '📸',
    color: 'bg-gradient-to-r from-purple-600 to-pink-600',
    secretKey: 'INSTAGRAM_ACCESS_TOKEN',
    maxChars: 2200,
    hashtagLimit: 30,
    supportsMarkdown: false,
    supportsHtml: false,
    formats: ['post', 'carousel', 'reel', 'story'],
    media: {
      maxImages: 10,
      maxVideoSeconds: 90,  // reels
      maxFileSizeMB: 100,
      supportedImageTypes: ['image/jpeg', 'image/png'],
      supportedVideoTypes: ['video/mp4'],
      imageAspectRatios: ['1:1', '4:5', '1.91:1'],
      maxImageWidth: 1440,
      maxImageHeight: 1800,
    },
    adaptText: (text, hashtags) => {
      const body = truncate(text, 2000);
      if (!hashtags) return body;
      const tags = hashtags.split(/[\s,]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`);
      // Instagram: hashtags go in a separate block after line breaks
      return `${body}\n\n.\n.\n.\n${tags.join(' ')}`;
    },
    buildCarousel: (slides) => ({
      slides: slides.slice(0, 10),
      coverCaption: slides[0]?.caption || '',
    }),
  },

  blog: {
    id: 'blog',
    label: 'Blog',
    emoji: '📝',
    color: 'bg-emerald-600',
    secretKey: 'BLOG_API_KEY',
    maxChars: 50000,
    hashtagLimit: 10,
    supportsMarkdown: true,
    supportsHtml: true,
    formats: ['article'],
    media: {
      maxImages: 20,
      maxVideoSeconds: 0,
      maxFileSizeMB: 10,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      supportedVideoTypes: [],
      thumbnailRequired: true,
    },
    adaptText: (text, hashtags) => {
      let article = text;
      if (hashtags) {
        const tags = hashtags.split(/[\s,]+/).filter(Boolean).map(t => t.replace('#', ''));
        article += `\n\n---\n**Tags:** ${tags.join(', ')}`;
      }
      return article;
    },
  },

  newsletter: {
    id: 'newsletter',
    label: 'Newsletter',
    emoji: '📧',
    color: 'bg-amber-600',
    secretKey: 'NEWSLETTER_API_KEY',
    maxChars: 50000,
    hashtagLimit: 0,
    supportsMarkdown: true,
    supportsHtml: true,
    formats: ['article'],
    media: {
      maxImages: 10,
      maxVideoSeconds: 0,
      maxFileSizeMB: 5,
      supportedImageTypes: ['image/jpeg', 'image/png', 'image/gif'],
      supportedVideoTypes: [],
      thumbnailRequired: true,
    },
    adaptText: (text) => text,
  },
};

/* ------------------------------------------------------------------ */
/*  Content package builder                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a ready-to-publish content package for a platform.
 * Handles text adaptation, thread splitting, and format selection.
 */
export function buildContentPackage(opts: {
  platform: PlatformId;
  text: string;
  hashtags?: string;
  mediaUrls?: string[];
  format?: ContentFormat;
  carouselSlides?: CarouselSlide[];
}): ContentPackage {
  const adapter = PLATFORM_ADAPTERS[opts.platform];
  if (!adapter) throw new Error(`Unknown platform: ${opts.platform}`);

  // Auto-detect format
  let format = opts.format || 'post';
  const mediaCount = opts.mediaUrls?.length || 0;

  if (!opts.format) {
    if (opts.carouselSlides && opts.carouselSlides.length > 1 && adapter.formats.includes('carousel')) {
      format = 'carousel';
    } else if (opts.text.length > adapter.maxChars && adapter.formats.includes('thread')) {
      format = 'thread';
    } else if (opts.text.length > 3000 && adapter.formats.includes('article')) {
      format = 'article';
    }
  }

  const adapted = adapter.adaptText(opts.text, opts.hashtags);

  const pkg: ContentPackage = {
    platform: opts.platform,
    format,
    text: adapted,
    hashtags: opts.hashtags || '',
    mediaUrls: (opts.mediaUrls || []).slice(0, adapter.media.maxImages),
    metadata: {},
  };

  // Thread splitting
  if (format === 'thread' && adapter.splitThread) {
    pkg.thread = adapter.splitThread(opts.text);
  }

  // Carousel
  if (format === 'carousel' && adapter.buildCarousel && opts.carouselSlides) {
    pkg.carousel = adapter.buildCarousel(opts.carouselSlides);
  }

  return pkg;
}

/* ------------------------------------------------------------------ */
/*  Export helpers                                                      */
/* ------------------------------------------------------------------ */

export const PLATFORM_IDS = Object.keys(PLATFORM_ADAPTERS) as PlatformId[];

export function getPlatform(id: string): PlatformAdapter | undefined {
  return PLATFORM_ADAPTERS[id as PlatformId];
}

export function validateMedia(platformId: PlatformId, file: { type: string; sizeBytes: number }): { ok: boolean; error?: string } {
  const adapter = PLATFORM_ADAPTERS[platformId];
  if (!adapter) return { ok: false, error: 'Unknown platform' };

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');

  if (isImage && !adapter.media.supportedImageTypes.includes(file.type)) {
    return { ok: false, error: `${adapter.label} does not support ${file.type} images` };
  }
  if (isVideo && !adapter.media.supportedVideoTypes.includes(file.type)) {
    return { ok: false, error: `${adapter.label} does not support ${file.type} videos` };
  }
  if (file.sizeBytes > adapter.media.maxFileSizeMB * 1024 * 1024) {
    return { ok: false, error: `File exceeds ${adapter.media.maxFileSizeMB}MB limit for ${adapter.label}` };
  }

  return { ok: true };
}
