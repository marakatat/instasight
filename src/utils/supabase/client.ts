import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://nuuyqasscxesqsmqcyjr.supabase.co";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dXlxYXNzY3hlc3FzbXFjeWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MzExNTAsImV4cCI6MjEwMzAwNzE1MH0.i_t0q7wzUsN9RdR2mu8bqBSo4LIU8MLrwCnOrmArKTE";

  return createBrowserClient(url, key);
}
