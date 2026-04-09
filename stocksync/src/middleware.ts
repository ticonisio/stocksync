import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LP_HOSTNAMES = ['stocksync.com.br', 'www.stocksync.com.br'];

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0] ?? '';

  // Landing page domain: only allow / and static assets
  if (LP_HOSTNAMES.includes(hostname)) {
    const { pathname } = request.nextUrl;

    // Allow root, static assets, and API routes needed for the LP
    if (
      pathname === '/' ||
      pathname === '/lp' ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/favicon') ||
      pathname.startsWith('/api/stripe')
    ) {
      // Rewrite root to /lp (landing page route)
      if (pathname === '/') {
        const url = request.nextUrl.clone();
        url.pathname = '/lp';
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }

    // Any other route on LP domain → redirect to app domain
    const appUrl = new URL(request.url);
    appUrl.hostname = 'app.stocksync.com.br';
    return NextResponse.redirect(appUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
