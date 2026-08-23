import Link from "next/link";

export default function PatientsPage() {
  return (
    <main className="min-h-[100dvh] bg-black text-white p-6 md:p-12">
      <div className="max-w-[1200px] mx-auto">
        <header className="mb-10">
          <Link
            href="/doctor/dashboard"
            className="text-xs font-mono tracking-[0.2em] uppercase text-white/40 hover:text-white transition-colors inline-block mb-6"
          >
            ← Doctor Dashboard
          </Link>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">
            Patients
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Roster of patients linked to your clinical cabinet.
          </p>
        </header>

        <hr className="rule-light !mt-0 mb-10" />

        <div className="border border-white/15 p-12 text-center">
          <p className="text-white/40 text-sm font-mono">
            Linked patients will appear here as they complete onboarding with your cabinet PIN.
          </p>
        </div>
      </div>
    </main>
  );
}
