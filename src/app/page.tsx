import Link from "next/link";
import { ArrowRight, UserCircle, SignOut, Pulse, Heartbeat, Brain } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-[100dvh] bg-zinc-950 flex flex-col text-zinc-100 font-sans selection:bg-zinc-800 selection:text-zinc-100">
      
      {/* ── Structural Header ── */}
      <header className="w-full max-w-7xl mx-auto px-6 md:px-12 py-8 flex justify-between items-center border-b border-zinc-900">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-zinc-100 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-zinc-300">
            Kineviz
          </span>
        </div>
        
        {user ? (
          <div className="flex items-center gap-6">
            <span className="text-xs font-mono text-zinc-500 flex items-center gap-2">
              <UserCircle size={16} weight="regular" className="text-zinc-400" />
              {user.email}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="text-sm font-medium text-zinc-500 hover:text-zinc-100 transition-colors flex items-center gap-2">
                Logout <SignOut size={14} weight="bold" />
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-950 bg-zinc-100 hover:bg-white px-6 py-2.5 rounded-sm transition-colors"
          >
            Sign in
          </Link>
        )}
      </header>

      {/* ── Asymmetric Hero ── */}
      <section className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32 grid md:grid-cols-12 gap-12 items-end">
        <div className="md:col-span-8 flex flex-col">
          <div className="inline-flex items-center gap-3 text-sm font-medium text-zinc-500 mb-12">
            <span className="w-8 h-px bg-zinc-800" />
            Platform v2.0
          </div>
          
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter leading-[0.85] text-zinc-100">
            Kineviz.
          </h1>
        </div>
        
        <div className="md:col-span-4 pb-4">
          <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-sm">
            Clinical kinematic tracking and real-time posture feedback. Bridging the gap between in-clinic sessions and remote recovery through browser-based telemetry.
          </p>
        </div>
      </section>

      <div className="w-full h-px bg-zinc-900 max-w-7xl mx-auto" />

      {/* ── Asymmetric Portal Links ── */}
      <section className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="grid md:grid-cols-12 gap-8 md:gap-12">
          
          <Link
            href="/patient/session/right_arm_raise"
            className="md:col-span-7 group block relative p-10 md:p-14 bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-500 overflow-hidden"
          >
            <div className="relative z-10 flex flex-col h-full min-h-[240px] justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-500 mb-6 block">
                  01 / Patient
                </span>
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-zinc-100">
                  Live Session
                </h2>
              </div>
              <div className="flex items-center justify-between mt-12 text-zinc-400 group-hover:text-zinc-100 transition-colors">
                <span className="text-sm font-medium">Initialize tracking</span>
                <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform duration-500" />
              </div>
            </div>
          </Link>

          <Link
            href="/doctor/dashboard"
            className="md:col-span-5 group block relative p-10 md:p-14 bg-zinc-900/50 border border-zinc-800/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-500 overflow-hidden mt-8 md:mt-24"
          >
            <div className="relative z-10 flex flex-col h-full min-h-[240px] justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-500 mb-6 block">
                  02 / Clinician
                </span>
                <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-zinc-100">
                  Dashboard
                </h2>
              </div>
              <div className="flex items-center justify-between mt-12 text-zinc-400 group-hover:text-zinc-100 transition-colors">
                <span className="text-sm font-medium">Review telemetry</span>
                <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform duration-500" />
              </div>
            </div>
          </Link>

        </div>
      </section>

      {/* ── Staggered Feature List (No 3-column equal grid!) ── */}
      <footer className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24 border-t border-zinc-900">
        <div className="flex flex-col gap-16 md:gap-24">
          
          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-zinc-500">
              <span className="text-sm font-medium">Phase 01</span>
              <div className="w-8 h-px bg-zinc-800" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Heartbeat size={24} weight="light" className="text-zinc-400 mb-6" />
                <h3 className="text-xl font-medium text-zinc-100 mb-3">Kinematic Extraction</h3>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Browser-based MediaPipe tracking captures joint angles, range of motion, and repetition cadence without external hardware.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-zinc-500">
              <span className="text-sm font-medium">Phase 02</span>
              <div className="w-8 h-px bg-zinc-800" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Brain size={24} weight="light" className="text-zinc-400 mb-6" />
                <h3 className="text-xl font-medium text-zinc-100 mb-3">Clinical Evaluation</h3>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Real-time vocal feedback corrects posture and pace. Full event logs are synchronized for clinician review.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-zinc-500">
              <span className="text-sm font-medium">Phase 03</span>
              <div className="w-8 h-px bg-zinc-800" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Pulse size={24} weight="light" className="text-zinc-400 mb-6" />
                <h3 className="text-xl font-medium text-zinc-100 mb-3">Motor Intent Fusion</h3>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Optional ESP32 integration maps EEG signals to kinematic outcomes, providing comprehensive neuro-rehabilitation data.
              </p>
            </div>
          </div>

        </div>
      </footer>
    </main>
  );
}
