import Link from "next/link";
import { ArrowRight, UserCircle, SignOut, Pulse, Heartbeat, Brain } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-[100dvh] bg-[#F7F4EE] flex flex-col text-[#36332E] font-sans selection:bg-[#36332E] selection:text-white pb-24">
      
      {/* ── Structural Header ── */}
      <header className="w-full max-w-7xl mx-auto px-6 md:px-12 py-8 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-[#36332E] rounded-full animate-pulse" />
          <span className="text-sm font-bold tracking-widest uppercase text-[#36332E]">
            Instasight
          </span>
        </div>
        
        {user ? (
          <div className="flex items-center gap-6">
            <span className="text-xs font-mono text-gray-500 flex items-center gap-2">
              <UserCircle size={16} weight="regular" className="text-gray-400" />
              {user.email}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-[#36332E] transition-colors flex items-center gap-2">
                Logout <SignOut size={14} weight="bold" />
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-[11px] font-bold tracking-widest uppercase text-white bg-[#36332E] hover:bg-black px-8 py-3 rounded-[24px] transition-colors shadow-sm"
          >
            Sign in
          </Link>
        )}
      </header>

      {/* ── Asymmetric Hero ── */}
      <section className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24 md:py-32 grid md:grid-cols-12 gap-12 items-end">
        <div className="md:col-span-8 flex flex-col">
          <div className="inline-flex items-center gap-4 text-[11px] font-bold tracking-widest uppercase text-gray-400 mb-12">
            <span className="w-12 h-px bg-gray-300" />
            Platform v2.0
          </div>
          
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-bold tracking-tighter leading-[0.85] text-[#36332E]">
            Instasight.
          </h1>
        </div>
        
        <div className="md:col-span-4 pb-4">
          <p className="text-sm md:text-base text-gray-500 leading-relaxed max-w-sm">
            Clinical kinematic tracking and real-time posture feedback. Bridging the gap between in-clinic sessions and remote recovery through browser-based telemetry.
          </p>
        </div>
      </section>

      <div className="w-full h-px bg-gray-200 max-w-7xl mx-auto" />

      {/* ── Asymmetric Portal Links ── */}
      <section className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24">
        <div className="grid md:grid-cols-12 gap-8 md:gap-12">
          
          <Link
            href="/patient/home"
            className="md:col-span-7 group block relative p-10 md:p-16 bg-white rounded-[40px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-2 transition-all duration-500 overflow-hidden"
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <span className="text-[9px] font-bold tracking-[0.25em] uppercase text-slate-400 mb-6 block">
                  01 / PATIENT
                </span>
                <h2 className="text-4xl md:text-6xl font-serif font-bold tracking-tight text-[#242220]">
                  Exercise Library
                </h2>
                <p className="text-slate-400 text-[13px] mt-4 font-medium">5 exercises — AI-guided, dataset-backed</p>
              </div>
              <div className="flex items-center justify-between mt-24 text-[#36332E] transition-colors">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">START A SESSION OR VIEW PROGRESS</span>
                <ArrowRight size={24} weight="light" className="group-hover:translate-x-2 transition-transform duration-500" />
              </div>
            </div>
          </Link>

          <Link
            href="/doctor/dashboard"
            className="md:col-span-5 group block relative p-10 md:p-16 bg-white rounded-[40px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_12px_30px_rgb(0,0,0,0.06)] hover:-translate-y-2 transition-all duration-500 overflow-hidden mt-8 md:mt-20"
          >
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <span className="text-[9px] font-bold tracking-[0.25em] uppercase text-slate-400 mb-6 block">
                  02 / CLINICIAN
                </span>
                <h2 className="text-4xl md:text-6xl font-serif font-bold tracking-tight text-[#242220]">
                  Dashboard
                </h2>
              </div>
              <div className="flex items-center justify-between mt-24 text-slate-400 group-hover:text-[#36332E] transition-colors">
                <span className="text-[10px] font-bold tracking-[0.2em] uppercase">REVIEW TELEMETRY</span>
                <ArrowRight size={24} weight="light" className="group-hover:translate-x-2 transition-transform duration-500" />
              </div>
            </div>
          </Link>

        </div>
      </section>

      {/* ── Staggered Feature List (No 3-column equal grid!) ── */}
      <footer className="w-full max-w-7xl mx-auto px-6 md:px-12 py-24 border-t border-gray-200">
        <div className="flex flex-col gap-16 md:gap-24">
          
          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-gray-400">
              <span className="text-[10px] font-bold tracking-widest uppercase">Phase 01</span>
              <div className="w-12 h-px bg-gray-200" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Heartbeat size={32} weight="light" className="text-[#36332E] mb-6" />
                <h3 className="text-xl font-serif font-bold text-[#36332E] mb-3">Kinematic Extraction</h3>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Browser-based MediaPipe tracking captures joint angles, range of motion, and repetition cadence without external hardware.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-gray-400">
              <span className="text-[10px] font-bold tracking-widest uppercase">Phase 02</span>
              <div className="w-12 h-px bg-gray-200" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Brain size={32} weight="light" className="text-[#36332E] mb-6" />
                <h3 className="text-xl font-serif font-bold text-[#36332E] mb-3">Clinical Evaluation</h3>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Real-time vocal feedback corrects posture and pace. Full event logs are synchronized for clinician review.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-4 flex items-center gap-4 text-gray-400">
              <span className="text-[10px] font-bold tracking-widest uppercase">Phase 03</span>
              <div className="w-12 h-px bg-gray-200" />
            </div>
            <div className="md:col-span-8 grid md:grid-cols-2 gap-8">
              <div>
                <Pulse size={32} weight="light" className="text-[#36332E] mb-6" />
                <h3 className="text-xl font-serif font-bold text-[#36332E] mb-3">Motor Intent Fusion</h3>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                Optional ESP32 integration maps EEG signals to kinematic outcomes, providing comprehensive neuro-rehabilitation data.
              </p>
            </div>
          </div>

        </div>
      </footer>
    </main>
  );
}
