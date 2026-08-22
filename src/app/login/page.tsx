"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ArrowRight, UserCircle, EnvelopeSimple, LockKey } from "@phosphor-icons/react";
import { motion } from "framer-motion";

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
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        // Upon successful signup, navigate to onboarding to pick a role
        router.push("/onboarding");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // Check role after login to redirect properly
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
          if (profile?.role === 'doctor') {
            router.push('/doctor/dashboard');
          } else if (profile?.role === 'patient') {
            router.push('/patient/session/demo123'); // Demo fallback
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
    <main className="min-h-[100dvh] bg-figma-base flex items-center justify-center p-6 selection:bg-figma-teal selection:text-white relative overflow-hidden">
      {/* Background Blurs */}



      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
        className="w-full max-w-md bg-white rounded-[2.5rem] p-10 border border-slate-200/50 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] relative z-10"
      >
        <div className="w-16 h-16 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-center mb-8 shadow-sm">
          <UserCircle size={32} weight="duotone" className="text-figma-teal" />
        </div>

        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight mb-2">
          {isSignUp ? "Create an account" : "Welcome back"}
        </h1>
        <p className="text-zinc-500 font-medium mb-8">
          {isSignUp ? "Join the next generation of telerehabilitation." : "Sign in to access your portal."}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium flex items-center gap-2">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 ml-1">Email Address</label>
            <div className="relative">
              <EnvelopeSimple size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-12 pr-4 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-figma-teal/50 focus:border-figma-teal transition-all"
                placeholder="hello@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 ml-1">Password</label>
            <div className="relative">
              <LockKey size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-3 pl-12 pr-4 text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-figma-teal/50 focus:border-figma-teal transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-900 hover:bg-black text-white rounded-xl py-4 font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-70 mt-4 group"
          >
            {loading ? "Processing..." : (isSignUp ? "Create Account" : "Sign In")}
            {!loading && <ArrowRight size={20} weight="bold" className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </motion.div>
    </main>
  );
}
