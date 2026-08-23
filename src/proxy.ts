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
            supabaseResponse.cookies.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              httpOnly: true,
            })
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

  const isDoctorRoute = request.nextUrl.pathname.startsWith('/doctor');
  const isPatientRoute = request.nextUrl.pathname.startsWith('/patient');
  const isProtectedRoute = isDoctorRoute || isPatientRoute || request.nextUrl.pathname.startsWith('/onboarding');
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login');

  if (isProtectedRoute && !user) {
    // Redirect unauthenticated users to login
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (isDoctorRoute || isPatientRoute)) {
    // RBAC: Check user role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile role in proxy:', error);
    }

    const role = profile?.role;

    if (isDoctorRoute && role !== 'doctor') {
      // Allow patients to view the clinical reports specifically
      const isSessionReport = request.nextUrl.pathname.startsWith('/doctor/sessions/');
      if (!(role === 'patient' && isSessionReport)) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        return NextResponse.redirect(redirectUrl);
      }
    }
    // Allow doctors to view patient routes for testing/demo purposes
    if (isPatientRoute && role !== 'patient' && role !== 'doctor') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      return NextResponse.redirect(redirectUrl);
    }
  }

  if (isAuthRoute && user) {
    // Redirect authenticated users away from login
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    return NextResponse.redirect(redirectUrl);
  }

  // Simple CSRF Check for API mutations
  if (request.nextUrl.pathname.startsWith('/api/') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (origin && host) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return new NextResponse("CSRF Violation", { status: 403 });
      }
    }
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
