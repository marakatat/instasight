import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nuuyqasscxesqsmqcyjr.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dXlxYXNzY3hlc3FzbXFjeWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MzExNTAsImV4cCI6MjEwMzAwNzE1MH0.i_t0q7wzUsN9RdR2mu8bqBSo4LIU8MLrwCnOrmArKTE";

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === "production",
              sameSite: "lax",
              httpOnly: true,
            });
          });
        } catch {
          // Ignore if called from a Server Component
        }
      },
    },
  });
}
