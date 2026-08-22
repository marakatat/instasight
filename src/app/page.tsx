import Link from "next/link";
import { ArrowRight, Webcam, FirstAid, ChartLineUp, UserCircle, SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/utils/supabase/server";
import { AnimatedRays } from "@/components/ui/animated-rays";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-[100dvh] bg-figma-base flex flex-col p-4 md:p-8 selection:bg-figma-teal selection:text-white">
      {/* Auth Header */}
      <header className="w-full max-w-7xl mx-auto flex justify-end items-center mb-6 gap-4">
        {user ? (
          <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-full border border-slate-200/50 shadow-sm">
            <span className="text-sm font-bold text-zinc-600 flex items-center gap-2">
              <UserCircle size={20} weight="fill" className="text-figma-teal" />
              {user.email}
            </span>
            <form action="/api/auth/signout" method="post">
              <button className="text-xs font-bold text-zinc-400 hover:text-red-500 transition-colors flex items-center gap-1">
                <SignOut size={16} weight="bold" /> Logout
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="bg-white text-zinc-900 px-6 py-2.5 rounded-full font-bold text-sm hover:bg-zinc-50 border border-slate-200/50 shadow-sm transition-colors">
            Sign In
          </Link>
        )}
      </header>

      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* Extracted Hero Section */}
        <section className="w-full bg-white rounded-[3rem] border border-slate-200/50 shadow-sm relative overflow-hidden group">
          <AnimatedRays className="py-24 px-10 md:py-32 md:px-20 flex flex-col items-start justify-center w-full min-h-[60vh]">
            <div className="max-w-4xl z-10 relative">
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-semibold tracking-tighter leading-[1.05] text-zinc-900">
                Next-generation <br />
                <span className="text-figma-teal">telerehabilitation.</span>
              </h1>
              <p className="mt-8 text-xl md:text-2xl text-zinc-500 max-w-2xl leading-relaxed font-medium">
                Real-time pose estimation and clinical AI feedback to bridge the gap between in-clinic sessions and at-home recovery.
              </p>
            </div>
          </AnimatedRays>
        </section>

        {/* Feature Bento Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[minmax(300px,auto)]">
          
          {/* Start Session CTA (Patient) */}
          <div className="md:col-span-12 lg:col-span-5 bg-zinc-950 rounded-[3rem] p-10 md:p-12 text-white flex flex-col justify-between shadow-xl relative overflow-hidden group hover:-translate-y-1 transition-transform duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="flex justify-between items-start z-10">
              <div className="bg-white/10 p-4 rounded-3xl backdrop-blur-md border border-white/10 shadow-inner">
                <Webcam size={36} weight="duotone" className="text-white" />
              </div>
              <span className="px-4 py-1.5 bg-figma-teal/20 text-figma-teal text-xs font-bold rounded-full">
                Live Demo
              </span>
            </div>
            <div className="z-10 mt-20">
              <h2 className="text-4xl font-semibold tracking-tight">Patient Portal</h2>
              <p className="mt-4 text-lg text-zinc-400 font-medium leading-relaxed max-w-sm">
                Start a live computer vision exercise session right in the browser.
              </p>
              <Link 
                href="/patient/session/demo123" 
                className="mt-10 flex items-center justify-between w-full bg-white text-zinc-950 px-8 py-5 rounded-2xl font-bold text-lg hover:bg-zinc-100 transition-colors shadow-lg"
              >
                Start Exercise
                <ArrowRight size={24} weight="bold" />
              </Link>
            </div>
          </div>

          {/* Doctor Dashboard Link */}
          <div className="md:col-span-12 lg:col-span-7 bg-white rounded-[3rem] p-10 md:p-12 border border-slate-200/50 shadow-sm flex flex-col justify-between group relative overflow-hidden">
            {/* Subtle background decoration */}
            <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-figma-purple-light/50 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
            
            <div className="flex items-center gap-5 z-10">
              <div className="bg-figma-purple-light p-4 rounded-3xl border border-figma-vibrant/10 shadow-sm">
                <FirstAid size={36} weight="duotone" className="text-figma-vibrant" />
              </div>
              <h2 className="text-3xl font-semibold text-zinc-900 tracking-tight">Doctor Dashboard</h2>
            </div>
            <div className="mt-20 flex flex-col md:flex-row md:items-end justify-between gap-8 z-10">
              <p className="text-zinc-500 text-lg max-w-sm font-medium leading-relaxed">
                Review patient sessions, analyze AI kinematics, and track recovery progress over time.
              </p>
              <Link 
                href="/doctor/dashboard"
                className="w-16 h-16 rounded-full bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-400 group-hover:bg-figma-vibrant group-hover:text-white group-hover:border-figma-vibrant group-hover:shadow-lg transition-all duration-300 shrink-0"
              >
                <ArrowRight size={28} weight="bold" />
              </Link>
            </div>
          </div>

          {/* Small Analytics Widget */}
          <div className="md:col-span-12 lg:col-span-12 bg-figma-mustard/10 rounded-[3rem] p-10 md:p-12 border border-figma-mustard/20 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="bg-white p-5 rounded-3xl shadow-sm border border-figma-mustard/10">
                <ChartLineUp size={36} weight="fill" className="text-figma-mustard" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-zinc-900 tracking-tight mb-2">AI Telemetry</h3>
                <p className="text-lg font-medium text-zinc-600 leading-relaxed max-w-xl">
                  Captures continuous ROM, cadence, and posture heuristics directly in the browser via MediaPipe. No hardware required.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
