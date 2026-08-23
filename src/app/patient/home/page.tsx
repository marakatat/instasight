import Link from "next/link";

export default function PatientHomePage() {
  return (
    <main className="min-h-[100dvh] bg-black text-white p-6 md:p-12">
      <div className="max-w-[1200px] mx-auto">
        <header className="mb-10">
          <Link
            href="/"
            className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors inline-block mb-6"
          >
            ← Instasight
          </Link>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">
            Patient Portal
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Your prescribed telerehabilitation program.
          </p>
        </header>

        <hr className="rule-light !mt-0 mb-10" />

        <div className="border border-white/15 p-8 max-w-xl">
          <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 block mb-2">
            Active Exercise
          </span>
          <h2 className="text-2xl font-serif font-bold text-white mb-3">
            Right Arm Raise
          </h2>
          <p className="text-white/50 text-sm mb-6 leading-relaxed">
            Real-time shoulder abduction tracking and motor intent detection via EEG.
          </p>
          <Link
            href="/patient/session/right_arm_raise"
            className="inline-block bg-white text-black font-bold text-xs font-mono tracking-widest uppercase px-6 py-3 hover:bg-white/90 transition-colors"
          >
            START SESSION →
          </Link>
        </div>
      </div>
    </main>
  );
}
