import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'inv_session';

/** Sends visitors without a session cookie to the login page. The API remains the real gatekeeper. */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/connexion';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, the API, Next internals and public PWA files.
  matcher: [
    '/((?!connexion|api|_next|icons|splash|manifest.webmanifest|robots.txt|sw.js|favicon.ico).*)',
  ],
};
