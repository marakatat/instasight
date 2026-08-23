import Link from "next/link";
import { ArrowRight, UserCircle, SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-[100dvh] bg-black flex flex-col">

      {/* ── Auth header ── */}
      <header className="w-full max-w-[1200px] mx-auto px-6 md:px-12 pt-8 flex justify-between items-center">
        <span className="text-xs font-mono tracking-[0.3em] uppercase text-white/40">
          Instasight
        </span>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60 flex items-center gap-2">
              <UserCircle size={18} weight="regular" className="text-white/40" />
              {user.email}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1">
                <SignOut size={14} weight="bold" /> Logout
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            Sign In →
          </Link>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col justify-center max-w-[1200px] mx-auto w-full px-6 md:px-12 py-24 md:py-32">
        <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-bold tracking-tight leading-[0.95] text-white">
          INSTA
          <br />
          SIGHT
        </h1>
        <p className="mt-8 text-lg md:text-xl text-white/50 max-w-xl leading-relaxed">
          Real-time pose estimation and clinical AI feedback — bridging
          in-clinic sessions with at-home recovery.
        </p>

        <hr className="rule-heavy mt-16 mb-12" />

        {/* ── Portal links ── */}
        <div className="grid md:grid-cols-2 gap-px bg-white/10">
          <Link
            href="/patient/session/right_arm_raise"
            className="group bg-black p-8 md:p-12 flex flex-col justify-between min-h-[200px] hover:bg-white hover:text-black transition-all duration-300"
          >
            <div>
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 group-hover:text-black/40 transition-colors">
                Patient
              </span>
              <h2 className="text-3xl md:text-4xl font-serif mt-4 group-hover:text-black transition-colors">
                Start Exercise
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-8 text-white/50 group-hover:text-black transition-colors">
              <span className="text-sm">Begin a live session</span>
              <ArrowRight size={18} weight="bold" className="group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>

          <Link
            href="/doctor/dashboard"
            className="group bg-black p-8 md:p-12 flex flex-col justify-between min-h-[200px] hover:bg-white hover:text-black transition-all duration-300"
          >
            <div>
              <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 group-hover:text-black/40 transition-colors">
                Clinician
              </span>
              <h2 className="text-3xl md:text-4xl font-serif mt-4 group-hover:text-black transition-colors">
                Doctor Dashboard
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-8 text-white/50 group-hover:text-black transition-colors">
              <span className="text-sm">Review AI sessions</span>
              <ArrowRight size={18} weight="bold" className="group-hover:translate-x-2 transition-transform" />
            </div>
          </Link>
        </div>
      </section>

      {/* ── Bottom feature strip ── */}
      <footer className="border-t border-white/10 max-w-[1200px] mx-auto w-full px-6 md:px-12">
        <div className="grid md:grid-cols-3 divide-x divide-white/10 py-12">
          <div className="pr-8">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40">01</span>
            <h3 className="text-lg font-serif mt-2">Pose Estimation</h3>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              MediaPipe-powered computer vision captures ROM, cadence, and posture directly in the browser.
            </p>
          </div>
          <div className="px-8">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40">02</span>
            <h3 className="text-lg font-serif mt-2">AI Feedback</h3>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              Real-time clinical suggestions spoken aloud during exercise, with full traceability for doctor review.
            </p>
          </div>
          <div className="pl-8">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40">03</span>
            <h3 className="text-lg font-serif mt-2">EEG Telemetry</h3>
            <p className="text-sm text-white/40 mt-2 leading-relaxed">
              ESP32-based motor intent detection fused with kinematic data for comprehensive neuro-rehabilitation.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
