"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        router.push("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
          if (profile?.role === 'doctor') {
            router.push('/doctor/dashboard');
          } else if (profile?.role === 'patient') {
            router.push('/patient/session/right_arm_raise');
          } else {
            router.push('/onboarding');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-black flex flex-col items-center justify-center px-6">

      <div className="w-full max-w-md">

        {/* ── Back link ── */}
        <Link
          href="/"
          className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors mb-12 inline-block"
        >
          ← Instasight
        </Link>

        {/* ── Heading ── */}
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-white mb-3">
          {isSignUp ? "Create Account" : "Sign In"}
        </h1>
        <p className="text-white/40 text-sm mb-10">
          {isSignUp
            ? "Join the next generation of clinical telerehabilitation."
            : "Access your patient or clinician portal."}
        </p>

        {/* ── Error ── */}
        {error && (
          <div className="mb-6 p-4 border border-white/20 bg-white/5 text-white text-sm">
            {error}
          </div>
        )}

        {/* ── Form ── */}
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label className="block text-xs font-mono tracking-[0.15em] uppercase text-white/40 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-transparent border border-white/15 px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-white/50 transition-colors"
              placeholder="hello@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-mono tracking-[0.15em] uppercase text-white/40 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-transparent border border-white/15 px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-white/50 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-4 font-bold text-sm tracking-wide hover:bg-white/90 transition-colors disabled:opacity-40 mt-2"
          >
            {loading ? "Processing..." : isSignUp ? "CREATE ACCOUNT →" : "SIGN IN →"}
          </button>
        </form>

        {/* ── Toggle ── */}
        <hr className="rule-light mt-10 mb-6" />
        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-white/40 hover:text-white transition-colors"
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </main>
  );
}
