import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3333',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3333',
]);

export function middleware(req: NextRequest) {
  // Only apply CORS to API routes
  if (!req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = req.headers.get('origin');
  const isAllowed = !origin || ALLOWED_ORIGINS.has(origin);

  // Block cross-origin requests from unknown origins
  if (!isAllowed) {
    return NextResponse.json({ ok: false, error: 'CORS: origin not allowed' }, { status: 403 });
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MC-Auth',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Add CORS headers to response
  const res = NextResponse.next();
  if (origin) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
