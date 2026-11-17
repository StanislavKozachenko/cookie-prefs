import { NextResponse, type NextRequest } from 'next/server';

// Strict CSP with a per-request nonce, following the Next.js CSP guide.
// /csp, /cspbad: scripts and styles by nonce. /tt: the same plus Trusted Types enforcement.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const tt = request.nextUrl.pathname.startsWith('/tt');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(tt ? ["require-trusted-types-for 'script'"] : []),
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = { matcher: ['/csp/:path*', '/cspbad/:path*', '/tt/:path*'] };
