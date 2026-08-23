import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Fast path for ESP32 and client telemetry endpoints (no auth cookie lookup required)
  if (request.nextUrl.pathname.startsWith('/api/device/')) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nuuyqasscxesqsmqcyjr.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dXlxYXNzY3hlc3FzbXFjeWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MzExNTAsImV4cCI6MjEwMzAwNzE1MH0.i_t0q7wzUsN9RdR2mu8bqBSo4LIU8MLrwCnOrmArKTE";

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fast path for ESP32 and client telemetry endpoints (no auth cookie lookup required)
  if (request.nextUrl.pathname.startsWith('/api/device/')) {
    return NextResponse.next();
  }

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith('/doctor') ||
    request.nextUrl.pathname.startsWith('/patient') ||
    request.nextUrl.pathname.startsWith('/onboarding');
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');

  if (isProtectedRoute && !user) {
    // Redirect unauthenticated users to login
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && user) {
    // Redirect authenticated users away from login
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  // Security headers
  supabaseResponse.headers.set('x-xss-protection', '1; mode=block');
  supabaseResponse.headers.set('x-content-type-options', 'nosniff');

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
