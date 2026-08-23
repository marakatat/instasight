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
    <main className="min-h-[100dvh] bg-[#F7F4EE] flex flex-col items-center justify-center px-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 md:p-12 shadow-sm border border-gray-100">

        {/* ── Back link ── */}
        <Link
          href="/"
          className="text-[10px] font-bold tracking-widest uppercase text-gray-400 hover:text-[#36332E] transition-colors mb-10 inline-block"
        >
          ← Instasight
        </Link>

        {/* ── Heading ── */}
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-[#36332E] mb-3">
          {isSignUp ? "Create Account" : "Sign In"}
        </h1>
        <p className="text-gray-500 text-sm mb-8">
          {isSignUp
            ? "Join the next generation of clinical telerehabilitation."
            : "Access your patient or clinician portal."}
        </p>

        {/* ── Error ── */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl border border-red-100 bg-red-50 text-[#B86F68] text-sm font-medium">
            {error}
          </div>
        )}

        {/* ── Form ── */}
        <form onSubmit={handleAuth} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#F7F4EE] border border-[#EAE5D9] rounded-[24px] px-5 py-4 text-[#36332E] placeholder:text-gray-400 focus:outline-none focus:border-gray-300 transition-colors"
              placeholder="hello@example.com"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#F7F4EE] border border-[#EAE5D9] rounded-[24px] px-5 py-4 text-[#36332E] placeholder:text-gray-400 focus:outline-none focus:border-gray-300 transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#36332E] text-white rounded-[24px] py-4 font-bold text-[11px] tracking-widest uppercase hover:bg-black transition-colors disabled:opacity-40 mt-4"
          >
            {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        {/* ── Toggle ── */}
        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-[11px] font-bold tracking-wide text-gray-400 hover:text-[#36332E] transition-colors"
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
