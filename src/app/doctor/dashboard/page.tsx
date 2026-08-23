import { createClient } from "@/utils/supabase/server";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";

export const dynamic = "force-dynamic";

export default async function DoctorDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the doctor's profile to get the PIN
  const { data: doctorProfile } = await supabase
    .from('profiles')
    .select('full_name, cabinet_code')
    .eq('id', user?.id)
    .single();

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("*, session_events(count), profiles(full_name)")
    .order("completed_at", { ascending: false });

  if (error) console.error("Error fetching sessions:", error);

  return (
    <main className="min-h-[100dvh] bg-black p-6 md:p-12">
      <div className="max-w-[1200px] mx-auto">

        {/* ── Header ── */}
        <header className="mb-4">
          <Link
            href="/"
            className="text-xs font-mono tracking-[0.2em] uppercase text-white/30 hover:text-white transition-colors inline-block mb-8"
          >
            ← Instasight
          </Link>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">
            {doctorProfile?.full_name
              ? `Dr. ${doctorProfile.full_name}`
              : "Clinical Dashboard"}
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Review AI-assisted telerehab sessions
          </p>
        </header>

        {/* ── Cabinet PIN ── */}
        {doctorProfile?.cabinet_code && (
          <div className="mt-6 mb-12 flex items-center gap-6">
            <span className="text-xs font-mono tracking-[0.2em] uppercase text-white/30">
              Cabinet PIN
            </span>
            <span className="font-mono text-2xl font-bold tracking-[0.5em] text-white">
              {doctorProfile.cabinet_code}
            </span>
          </div>
        )}

        {!doctorProfile?.cabinet_code && <div className="mb-12" />}

        <hr className="rule-light !mt-0 mb-10" />

        {/* ── Sessions ── */}
        {!sessions || sessions.length === 0 ? (
          <div className="border border-white/10 p-12 md:p-16 text-center">
            <h2 className="text-2xl font-serif text-white mb-3">
              No sessions recorded yet
            </h2>
            <p className="text-sm text-white/40 max-w-sm mx-auto">
              Patient exercises captured via the portal will automatically sync here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10">
            {sessions.map((session: any) => {
              const eventCount = session.session_events?.[0]?.count ?? 0;
              const date = new Date(session.completed_at);
              const formattedDate = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const time = date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });

              const title =
                session.exercise_id
                  ?.replace(/_/g, " ")
                  .replace(/\b\w/g, (c: string) => c.toUpperCase()) ||
                "Exercise Session";
              const patientName =
                session.profiles?.full_name || "Unknown Patient";

              return (
                <Link
                  key={session.id}
                  href={`/doctor/sessions/${session.id}`}
                  className="group bg-black p-8 flex flex-col justify-between hover:bg-white hover:text-black transition-all duration-300 min-h-[220px]"
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-serif font-bold group-hover:text-black transition-colors">
                        {title}
                      </h3>
                      <span className="text-xs font-mono text-white/40 group-hover:text-black/40 transition-colors">
                        {patientName}
                      </span>
                    </div>
                    <p className="text-sm text-white/40 group-hover:text-black/50 transition-colors">
                      {formattedDate} at {time}
                    </p>
                  </div>

                  <div className="flex items-end justify-between mt-6 pt-6 border-t border-white/10 group-hover:border-black/10 transition-colors">
                    <div>
                      <span className="text-xs font-mono tracking-[0.15em] uppercase text-white/30 group-hover:text-black/30 transition-colors">
                        Events
                      </span>
                      <p className="font-mono text-2xl font-bold group-hover:text-black transition-colors">
                        {eventCount}
                      </p>
                    </div>
                    <ArrowRight
                      size={20}
                      weight="bold"
                      className="text-white/30 group-hover:text-black group-hover:translate-x-1 transition-all"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
